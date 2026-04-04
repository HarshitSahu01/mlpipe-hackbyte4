# backend/app/workers/build_tasks.py
"""
Celery task: build_model_image

Given a model ID and a ZIP file path (or pre-extracted context dir):
1. Unzips the package if needed
2. Runs `docker build` with the user's Dockerfile exactly as-is
3. Streams every log line to the shared task log
4. Tags the resulting image as ml-pipeline/<model_id>:latest
5. POSTs a webhook back to Next.js with status + logs_path

All log output appends to the SAME file used by upstream tasks
(github_tasks, agent_tasks) so the frontend sees one unified stream.

NOTE: The Dockerfile is never modified — apt installs, custom base images,
and any system-level setup run exactly as the user wrote them.
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import tempfile
import traceback
import zipfile
from typing import Any, Dict

import docker
import httpx
from celery import Task
from dotenv import load_dotenv

from app.core.celery_app import celery_app
from app.workers.log_helpers import TaskLogger

load_dotenv()

_DEFAULT_SHARED = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "shared_storage"
SHARED_STORAGE_PATH = pathlib.Path(os.getenv("SHARED_STORAGE_PATH", str(_DEFAULT_SHARED))).resolve()
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_WEBHOOK_URL", "http://127.0.0.1:3000/api/webhooks/fastapi")


def _send_build_webhook(
    task_id: str,
    status: str,
    model_id: str = "",
    docker_image: str = "",
    logs_path: str = "",
    error: str = "",
    webhook_url: str = NEXTJS_WEBHOOK_URL,
) -> None:
    payload = {
        "task_id": task_id,
        "status": status,
        "model_id": model_id,
        "docker_image": docker_image,
        "logs_path": logs_path,
        "error": error,
        "task_type": "build",
    }
    try:
        print(f"[webhook] Sending to {webhook_url} | task_id: {task_id} | status: {status}")
        with httpx.Client(timeout=10.0) as client:
            res = client.post(webhook_url, json=payload)
            print(f"[webhook] Response: {res.status_code}")
    except Exception as exc:
        print(f"[webhook] Failed to notify Next.js: {exc}")



@celery_app.task(bind=True, name="build_model_image", max_retries=0)
def build_model_image(self: Task, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepts:
      - task_id:     str  (MongoDB Task _id)
      - model_id:    str  (MongoDB MLModel _id)
      - zip_path:    str  (absolute host path to uploaded ZIP)  [optional]
      - context_path: str (pre-extracted directory)            [optional]
      - logs_path:   str  (if set, APPENDS to this shared log rather than creating new)
      - image_tag:   str  (e.g. ml-pipeline/<model_id>:latest)
      - webhook_url: str  (optional override)
    """
    task_id    = payload_dict["task_id"]
    model_id   = payload_dict["model_id"]
    zip_path   = payload_dict.get("zip_path")
    context_path = payload_dict.get("context_path")
    image_tag  = payload_dict.get("image_tag", f"ml-pipeline/{model_id}:latest")
    webhook_url = payload_dict.get("webhook_url", NEXTJS_WEBHOOK_URL)

    # --- Unified log file ---
    # If an upstream task (github/agent) already created a log, use it (append mode).
    # Otherwise create a fresh one.
    existing_logs_path = payload_dict.get("logs_path")
    if existing_logs_path:
        logger = TaskLogger.__new__(TaskLogger)
        logger.logs_path = pathlib.Path(existing_logs_path)
        logger.logs_path.parent.mkdir(parents=True, exist_ok=True)
        # Don't truncate — just append from here on
    else:
        task_output_dir = SHARED_STORAGE_PATH / "build_logs" / task_id
        task_output_dir.mkdir(parents=True, exist_ok=True)
        logger = TaskLogger(task_output_dir / "build_logs.txt")

    logs_path = logger.path

    logger.section("🐳  Docker Build Phase")
    logger.info(f"Model: {model_id}")
    logger.info(f"Image tag: {image_tag}")
    if zip_path:
        logger.info(f"ZIP: {zip_path}")

    _send_build_webhook(task_id, "running", model_id=model_id, logs_path=logs_path, webhook_url=webhook_url)

    tmp_dir = None
    try:
        if context_path:
            logger.info(f"Using pre-extracted context: {context_path}")
            build_context = context_path
        elif zip_path:
            tmp_dir = tempfile.mkdtemp(prefix="mlp_build_")
            logger.info(f"Extracting ZIP to {tmp_dir}")

            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmp_dir)

            entries = list(pathlib.Path(tmp_dir).iterdir())
            build_context = tmp_dir
            if len(entries) == 1 and entries[0].is_dir():
                build_context = str(entries[0])
        else:
            raise ValueError("Either zip_path or context_path must be provided.")

        # --- Compatibility: Rename inference.py → run.py ---
        ctx_path = pathlib.Path(build_context)
        run_file = ctx_path / "run.py"
        inference_file = None
        for p in ctx_path.iterdir():
            if p.name.lower() == "run.py":
                run_file = p
                break
            if p.name.lower() == "inference.py":
                inference_file = p

        if not run_file.exists() and inference_file and inference_file.exists():
            logger.info(f"Renaming {inference_file.name} → run.py for standard compatibility")
            inference_file.rename(ctx_path / "run.py")

        # --- Find Dockerfile ---
        dockerfile_name = "DOCKERFILE"
        for p in pathlib.Path(build_context).iterdir():
            if p.name.upper() == "DOCKERFILE":
                dockerfile_name = p.name
                break

        dockerfile_path = pathlib.Path(build_context) / dockerfile_name
        if not dockerfile_path.exists():
            raise FileNotFoundError(f"Dockerfile not found in {build_context}")


        logger.info(f"Build context: {build_context}")
        logger.info(f"Dockerfile: {dockerfile_path.name}")

        # --- Docker build ---
        logger.section("🔨  Docker Build Logs")
        docker_client = docker.from_env()
        logger.info("Running docker build ...")

        _, build_log_gen = docker_client.images.build(
            path=build_context,
            dockerfile=dockerfile_path.name,
            tag=image_tag,
            rm=True,
            decode=False,
        )

        for line in build_log_gen:
            chunks = []
            if isinstance(line, bytes):
                for prt in line.decode("utf-8").split("\r\n"):
                    if not prt.strip():
                        continue
                    try:
                        chunks.append(json.loads(prt))
                    except json.JSONDecodeError:
                        continue
            else:
                chunks = [line]

            for chunk in chunks:
                if not isinstance(chunk, dict):
                    continue
                if "stream" in chunk:
                    s = chunk["stream"].rstrip("\n")
                    if s:
                        logger.raw(s)
                        print(f"[docker-build] {s}")
                elif "error" in chunk:
                    err = chunk["error"]
                    logger.error(err)
                    raise RuntimeError(err)
                elif "status" in chunk:
                    logger.raw(chunk["status"])

        logger.section("🎉  Build Complete")
        logger.success(f"Image built: {image_tag}")

        _send_build_webhook(
            task_id, "completed",
            model_id=model_id,
            docker_image=image_tag,
            logs_path=logs_path,
            webhook_url=webhook_url,
        )
        return {"status": "completed", "image_tag": image_tag}

    except Exception as exc:
        logger.error(traceback.format_exc())
        _send_build_webhook(
            task_id, "failed",
            model_id=model_id,
            logs_path=logs_path,
            error=str(exc),
            webhook_url=webhook_url,
        )
        raise

    finally:
        if tmp_dir and pathlib.Path(tmp_dir).exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
