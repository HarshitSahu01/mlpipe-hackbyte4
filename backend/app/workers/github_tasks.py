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

load_dotenv()

_DEFAULT_SHARED = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "shared_storage"
SHARED_STORAGE_PATH = pathlib.Path(os.getenv("SHARED_STORAGE_PATH", str(_DEFAULT_SHARED))).resolve()
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_WEBHOOK_URL", "http://127.0.0.1:3000/api/webhooks/fastapi")

@celery_app.task(bind=True, name="pull_from_github", max_retries=0)
def pull_from_github(self: Task, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Downloads a GitHub repository branch, extracts a specific folder,
    and then triggers a Docker build task.
    
    Payload:
      - task_id:      str (Next.js Task _id)
      - model_id:     str (Next.js Model _id)
      - repo_url:     str (e.g. https://github.com/user/repo)
      - branch:       str (e.g. main)
      - model_root:   str (relative path within repo, e.g. "models/sentiment")
      - image_tag:    str (optional)
      - webhook_url:  str (optional)
    """
    task_id = payload_dict["task_id"]
    model_id = payload_dict["model_id"]
    repo_url = payload_dict["repo_url"].rstrip("/")
    branch = payload_dict.get("branch", "main")
    model_root = payload_dict.get("model_root", "").strip("/")
    image_tag = payload_dict.get("image_tag", f"predict-xplore/{model_id}:latest")
    webhook_url = payload_dict.get("webhook_url", NEXTJS_WEBHOOK_URL)

    # Prepare log file
    task_output_dir = SHARED_STORAGE_PATH / "build_logs" / task_id
    task_output_dir.mkdir(parents=True, exist_ok=True)
    logs_path = str(task_output_dir / "build_logs.txt")

    log_lines = [
        f"[github] Starting pull for model {model_id}",
        f"[github] Repo: {repo_url}",
        f"[github] Branch: {branch}",
        f"[github] Root Folder: {model_root or '(repo root)'}"
    ]

    def flush_logs():
        pathlib.Path(logs_path).write_text("\n".join(log_lines), encoding="utf-8")

    flush_logs()
    _send_build_webhook(task_id, "running", model_id=model_id, logs_path=logs_path, webhook_url=webhook_url)

    tmp_dir = None
    try:
        # Parse owner and repo
        # https://github.com/owner/repo -> owner/repo
        parts = repo_url.replace("https://github.com/", "").split("/")
        if len(parts) < 2:
            raise ValueError(f"Invalid GitHub URL: {repo_url}")
        owner, repo = parts[0], parts[1]

        archive_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
        log_lines.append(f"[github] Downloading archive: {archive_url}")
        flush_logs()

        tmp_dir = tempfile.mkdtemp(prefix="px_git_")
        zip_path = os.path.join(tmp_dir, "repo.zip")

        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            resp = client.get(archive_url)
            resp.raise_for_status()
            with open(zip_path, "wb") as f:
                f.write(resp.content)

        log_lines.append("[github] Extracting archive...")
        flush_logs()

        extract_dir = os.path.join(tmp_dir, "extracted")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        # GitHub ZIP structure is usually repo-branch/
        # e.g. hackbyte4-main/
        entries = os.listdir(extract_dir)
        if not entries:
            raise RuntimeError("Extracted archive is empty")
        
        repo_root_in_zip = os.path.join(extract_dir, entries[0])
        source_context = os.path.join(repo_root_in_zip, model_root)

        if not os.path.exists(source_context):
            raise FileNotFoundError(f"Model root '{model_root}' not found in repository.")

        # Move to persistent shared storage
        final_source_dir = SHARED_STORAGE_PATH / "models" / model_id / "source"
        if final_source_dir.exists():
            shutil.rmtree(final_source_dir)
        final_source_dir.mkdir(parents=True, exist_ok=True)

        log_lines.append(f"[github] Copying files to {final_source_dir}...")
        flush_logs()
        
        # Copy content of source_context to final_source_dir
        for item in os.listdir(source_context):
            s = os.path.join(source_context, item)
            d = os.path.join(str(final_source_dir), item)
            if os.path.isdir(s):
                shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)

        log_lines.append("[github] Successfully pulled source. Triggering build...")
        flush_logs()

        # Trigger build_model_image task
        build_payload = {
            "task_id": task_id,
            "model_id": model_id,
            "context_path": str(final_source_dir),
            "image_tag": image_tag,
            "webhook_url": webhook_url
        }
        
        # We can't use .delay here easily if we want to preserve logs or chain correctly.
        # But per instructions "task to task flow", we'll call it.
        # Calling it within the same worker thread might be fine if we use the same task_id
        # or we just chain them.
        
        # Chaining would be better, but for now let's just trigger it.
        build_model_image.apply_async(args=[build_payload], task_id=f"build-{task_id}")

        return {"status": "success", "message": "Source pulled and build triggered"}

    except Exception as exc:
        error_msg = traceback.format_exc()
        log_lines.append(f"\n[EXCEPTION]\n{error_msg}")
        flush_logs()
        _send_build_webhook(
            task_id,
            "failed",
            model_id=model_id,
            logs_path=logs_path,
            error=str(exc),
            webhook_url=webhook_url,
        )
        raise

    finally:
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
