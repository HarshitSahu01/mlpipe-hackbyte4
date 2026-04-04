# backend/app/workers/github_tasks.py
import os
import pathlib
import shutil
import tempfile
import traceback
import zipfile
import httpx
from typing import Any, Dict
from celery import Task
from dotenv import load_dotenv

from app.core.celery_app import celery_app
from app.workers.build_tasks import build_model_image, _send_build_webhook
from app.workers.log_helpers import TaskLogger

load_dotenv()

_DEFAULT_SHARED = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "shared_storage"
SHARED_STORAGE_PATH = pathlib.Path(os.getenv("SHARED_STORAGE_PATH", str(_DEFAULT_SHARED))).resolve()
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_WEBHOOK_URL", "http://127.0.0.1:3000/api/webhooks/fastapi")


@celery_app.task(bind=True, name="pull_from_github", max_retries=0)
def pull_from_github(self: Task, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Downloads a GitHub repository branch, extracts a specific folder,
    and then triggers a Docker build task — all writing to the same log file.

    Payload:
      - task_id:      str (Next.js Task _id)
      - model_id:     str (Next.js Model _id)
      - repo_url:     str (e.g. https://github.com/user/repo)
      - branch:       str (e.g. main)
      - model_root:   str (relative path within repo, e.g. "models/sentiment")
      - image_tag:    str (optional)
      - webhook_url:  str (optional)
    """
    task_id           = payload_dict["task_id"]
    model_id          = payload_dict["model_id"]
    repo_url          = payload_dict["repo_url"].rstrip("/")
    branch            = payload_dict.get("branch", "main")
    model_root        = payload_dict.get("model_root", "").strip("/")
    dockerfile_folder = payload_dict.get("dockerfile_folder", "docker")
    image_tag         = payload_dict.get("image_tag", f"ml-pipeline/{model_id}:latest")
    webhook_url       = payload_dict.get("webhook_url", NEXTJS_WEBHOOK_URL)

    # --- Unified log file (created fresh here, appended by build task) ---
    task_output_dir = SHARED_STORAGE_PATH / "build_logs" / task_id
    task_output_dir.mkdir(parents=True, exist_ok=True)
    logger = TaskLogger(task_output_dir / "build_logs.txt")

    logger.section("🐙  GitHub Pull Phase")
    logger.info(f"Model: {model_id}")
    logger.info(f"Repo: {repo_url}")
    logger.info(f"Branch: {branch}")
    logger.info(f"Root: {model_root or '(repo root)'}")

    _send_build_webhook(task_id, "running", model_id=model_id, logs_path=logger.path, webhook_url=webhook_url)

    tmp_dir = None
    try:
        parts = repo_url.replace("https://github.com/", "").split("/")
        if len(parts) < 2:
            raise ValueError(f"Invalid GitHub URL: {repo_url}")
        owner, repo = parts[0], parts[1]

        archive_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
        logger.info(f"Downloading archive: {archive_url}")

        tmp_dir = tempfile.mkdtemp(prefix="mlp_git_")
        zip_path = os.path.join(tmp_dir, "repo.zip")

        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            resp = client.get(archive_url)
            resp.raise_for_status()
            with open(zip_path, "wb") as f:
                f.write(resp.content)

        logger.info(f"Downloaded {len(resp.content) // 1024} KB — extracting...")

        extract_dir = os.path.join(tmp_dir, "extracted")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        entries = os.listdir(extract_dir)
        if not entries:
            raise RuntimeError("Extracted archive is empty")

        repo_root_in_zip = os.path.join(extract_dir, entries[0])
        source_context = os.path.join(repo_root_in_zip, model_root)

        if not os.path.exists(source_context):
            raise FileNotFoundError(f"Model root '{model_root}' not found in repository.")

        final_source_dir = SHARED_STORAGE_PATH / "models" / model_id / "source"
        if final_source_dir.exists():
            shutil.rmtree(final_source_dir)
        final_source_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Copying source files (excluding /{dockerfile_folder}) to shared storage...")
        for item in os.listdir(source_context):
            # Skip the dockerfile subfolder — Dockerfile is handled separately below
            if item.lower() == dockerfile_folder.lower():
                continue
            s = os.path.join(source_context, item)
            d = os.path.join(str(final_source_dir), item)
            if os.path.isdir(s):
                shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)

        # --- Resolve Dockerfile from the dedicated subfolder ---
        docker_subdir = os.path.join(source_context, dockerfile_folder)
        if not os.path.isdir(docker_subdir):
            raise FileNotFoundError(
                f"No '/{dockerfile_folder}' sub-folder found inside model root "
                f"'{model_root or '(repo root)'}'. "
                f"Please add a '{dockerfile_folder}/' directory containing your Dockerfile."
            )

        dockerfile_src = None
        for fname in os.listdir(docker_subdir):
            if fname.lower() == "dockerfile":
                dockerfile_src = os.path.join(docker_subdir, fname)
                break

        if dockerfile_src is None:
            raise FileNotFoundError(
                f"No Dockerfile found inside the '/{dockerfile_folder}' sub-folder of "
                f"model root '{model_root or '(repo root)'}'. "
                f"Expected: <repo>/{model_root}/{dockerfile_folder}/Dockerfile"
            )

        shutil.copy2(dockerfile_src, os.path.join(str(final_source_dir), "Dockerfile"))
        logger.success(
            f"Dockerfile copied from /{dockerfile_folder}/Dockerfile "
            f"→ {final_source_dir}/Dockerfile"
        )
        logger.success(f"Source pulled successfully into {final_source_dir}")
        logger.info("Triggering Docker build...")

        # Pass logs_path so the build task APPENDS to this same file
        build_payload = {
            "task_id":      task_id,
            "model_id":     model_id,
            "context_path": str(final_source_dir),
            "image_tag":    image_tag,
            "webhook_url":  webhook_url,
            "logs_path":    logger.path,   # ← unified log handoff
        }
        build_model_image.apply_async(args=[build_payload], task_id=f"build-{task_id}")

        return {"status": "success", "message": "Source pulled and build triggered"}

    except Exception as exc:
        logger.error(traceback.format_exc())
        _send_build_webhook(
            task_id, "failed",
            model_id=model_id,
            logs_path=logger.path,
            error=str(exc),
            webhook_url=webhook_url,
        )
        raise

    finally:
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
