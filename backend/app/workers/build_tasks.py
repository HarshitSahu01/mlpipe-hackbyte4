# backend/app/workers/build_tasks.py
"""
Celery task: build_model_image

Given a model ID and a ZIP file path containing a Dockerfile:
1. Unzips the package into a temp directory
2. Runs `docker build` on it, streaming logs line-by-line to a logs.txt file
3. Tags the resulting image as predict-xplore/<model_id>:latest
4. POSTs a webhook back to Next.js with status + logs_path
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
      - zip_path:    str  (absolute host path to uploaded ZIP)
      - image_tag:   str  (e.g. predict-xplore/<model_id>:latest)
      - webhook_url: str  (optional override)
    """
    task_id = payload_dict["task_id"]
    model_id = payload_dict["model_id"]
    zip_path = payload_dict["zip_path"]
    image_tag = payload_dict.get("image_tag", f"predict-xplore/{model_id}:latest")
    webhook_url = payload_dict.get("webhook_url", NEXTJS_WEBHOOK_URL)

    # --- Prepare log file ---
    task_output_dir = SHARED_STORAGE_PATH / "build_logs" / task_id
    task_output_dir.mkdir(parents=True, exist_ok=True)
    logs_path = str(task_output_dir / "build_logs.txt")

    log_lines = [f"[build] Starting image build for model {model_id}",
                 f"[build] ZIP: {zip_path}",
                 f"[build] Target image tag: {image_tag}"]

    def flush_logs():
        pathlib.Path(logs_path).write_text("\n".join(log_lines), encoding="utf-8")

    flush_logs()
    _send_build_webhook(task_id, "running", model_id=model_id, logs_path=logs_path, webhook_url=webhook_url)

    tmp_dir = None
    try:
        # --- Extract ZIP ---
        tmp_dir = tempfile.mkdtemp(prefix="px_build_")
        log_lines.append(f"[build] Extracting ZIP to {tmp_dir}")
        flush_logs()

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)

        # Detect if files were wrapped in a single subdirectory
        entries = list(pathlib.Path(tmp_dir).iterdir())
        build_context = tmp_dir
        if len(entries) == 1 and entries[0].is_dir():
            build_context = str(entries[0])

        # Case-insensitive search for Dockerfile/DOCKERFILE
        dockerfile_name = "DOCKERFILE"
        for p in pathlib.Path(build_context).iterdir():
            if p.name.upper() == "DOCKERFILE":
                dockerfile_name = p.name
                break
        
        dockerfile_path = pathlib.Path(build_context) / dockerfile_name
        if not dockerfile_path.exists():
             raise FileNotFoundError(f"Dockerfile not found in {build_context}")

        log_lines.append(f"[build] Build context: {build_context}")
        log_lines.append(f"[build] Dockerfile: {dockerfile_path.name}")
        flush_logs()

        # --- Docker build ---
        docker_client = docker.from_env()
        log_lines.append("[build] Running docker build ...")
        flush_logs()

        _, build_log_gen = docker_client.images.build(
            path=build_context,
            dockerfile=dockerfile_path.name,
            tag=image_tag,
            rm=True,
            decode=False, # Manually decode to avoid 'dict' object has no attribute 'decode' bug
        )

        for line in build_log_gen:
            # Polymorphic handling for SDK inconsistencies:
            # Sometimes it yields bytes, sometimes dict even with decode=False
            chunks = []
            if isinstance(line, bytes):
                for prt in line.decode('utf-8').split('\r\n'):
                    if not prt.strip(): continue
                    try:
                        chunks.append(json.loads(prt))
                    except json.JSONDecodeError:
                        continue
            else:
                chunks = [line]

            for chunk in chunks:
                if not isinstance(chunk, dict): continue
                
                if "stream" in chunk:
                    s = chunk["stream"].rstrip("\n")
                    if s:
                        log_lines.append(s)
                        flush_logs()
                        print(f"[docker-build] {s}")
                elif "error" in chunk:
                    error_detail = chunk["error"]
                    log_lines.append(f"[ERROR] {error_detail}")
                    flush_logs()
                    raise RuntimeError(error_detail)
                elif "status" in chunk:
                    log_lines.append(chunk["status"])
                    flush_logs()

        log_lines.append(f"\n[build] ✅ Image built successfully: {image_tag}")
        flush_logs()

        _send_build_webhook(
            task_id,
            "completed",
            model_id=model_id,
            docker_image=image_tag,
            logs_path=logs_path,
            webhook_url=webhook_url,
        )
        return {"status": "completed", "image_tag": image_tag}

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
        if tmp_dir and pathlib.Path(tmp_dir).exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
