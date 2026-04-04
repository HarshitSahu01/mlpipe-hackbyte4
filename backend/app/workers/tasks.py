# backend/app/workers/tasks.py
"""
Core Celery task: run_inference_pipeline

For each node in the pipeline (sorted by order):
1. Pull the Docker image
2. Run the container, mounting shared_storage as a volume
3. Pass INPUT_PATH / OUTPUT_PATH as environment variables
4. Stream + capture logs
5. Check exit code
On completion: POST callback to Next.js webhook with status, paths, logs.
"""
from __future__ import annotations

import json
import os
import pathlib
import traceback
from typing import Any, Dict, List

import docker
import httpx
from celery import Task
from dotenv import load_dotenv

from app.core.celery_app import celery_app
from app.schemas.task import TriggerPayload, NodeSpec, WebhookPayload

load_dotenv()

SHARED_STORAGE_PATH = pathlib.Path(os.getenv("SHARED_STORAGE_PATH", "../shared_storage")).resolve()
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_WEBHOOK_URL", "http://localhost:3000/api/webhooks/fastapi")


def _send_webhook(task_id: str, status: str, results_path: str = "", logs_path: str = "", error: str = "") -> None:
    """Fire-and-forget POST to the Next.js webhook endpoint."""
    payload = {
        "task_id": task_id,
        "status": status,
        "results_path": results_path,
        "logs_path": logs_path,
        "error": error,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(NEXTJS_WEBHOOK_URL, json=payload)
    except Exception as exc:
        print(f"[webhook] Failed to notify Next.js: {exc}")


def _pull_image(client: docker.DockerClient, image: str) -> None:
    """Pull Docker image if not already cached locally."""
    try:
        client.images.get(image)
        print(f"[docker] Image already present: {image}")
    except docker.errors.ImageNotFound:
        print(f"[docker] Pulling {image} ...")
        client.images.pull(image)
        print(f"[docker] Pull complete: {image}")


def _run_node(
    client: docker.DockerClient,
    node: NodeSpec,
    task_id: str,
    log_lines: List[str],
) -> bool:
    """
    Run a single pipeline node container.
    Returns True on success, False on failure.
    """
    # Ensure output directory exists
    output_dir = pathlib.Path(node.output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # Ensure input directory exists (create empty input file if missing)
    input_dir = pathlib.Path(node.input_path).parent
    input_dir.mkdir(parents=True, exist_ok=True)
    if not pathlib.Path(node.input_path).exists():
        pathlib.Path(node.input_path).write_text(json.dumps({}))

    volumes = {
        str(SHARED_STORAGE_PATH): {
            "bind": "/shared_storage",
            "mode": "rw",
        }
    }

    # Remap absolute host paths → container paths
    def host_to_container(p: str) -> str:
        try:
            rel = pathlib.Path(p).resolve().relative_to(SHARED_STORAGE_PATH)
            return f"/shared_storage/{rel.as_posix()}"
        except ValueError:
            return p  # already a container path

    environment = {
        "INPUT_PATH": host_to_container(node.input_path),
        "OUTPUT_PATH": host_to_container(node.output_path),
        "MODEL_PATH": host_to_container(node.model_path) if node.model_path else "",
        "TASK_ID": task_id,
        "MODEL_ID": node.model_id,
    }

    _pull_image(client, node.docker_image)

    log_lines.append(f"\n--- Node {node.model_id} | image: {node.docker_image} ---")

    container = client.containers.run(
        image=node.docker_image,
        environment=environment,
        volumes=volumes,
        detach=True,
        remove=False,
    )

    # Stream logs
    for line in container.logs(stream=True, follow=True):
        decoded = line.decode("utf-8", errors="replace").rstrip()
        log_lines.append(decoded)
        print(f"[container:{container.short_id}] {decoded}")

    result = container.wait()
    exit_code = result.get("StatusCode", -1)
    container.remove(force=True)

    log_lines.append(f"--- Exit code: {exit_code} ---\n")
    return exit_code == 0


@celery_app.task(bind=True, name="run_inference_pipeline", max_retries=0)
def run_inference_pipeline(self: Task, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main Celery task.
    Accepts the TriggerPayload serialized as a dict.
    """
    payload = TriggerPayload(**payload_dict)
    task_id = payload.task_id
    webhook_url_override = payload.webhook_url or NEXTJS_WEBHOOK_URL

    # Override module-level URL with per-task URL
    global NEXTJS_WEBHOOK_URL
    NEXTJS_WEBHOOK_URL = webhook_url_override

    log_lines: List[str] = [f"Predict-Xplore | Task: {task_id}"]

    # Task output directory on host
    task_output_dir = SHARED_STORAGE_PATH / "outputs" / task_id
    task_output_dir.mkdir(parents=True, exist_ok=True)
    logs_path = str(task_output_dir / "logs.txt")

    def flush_logs():
        pathlib.Path(logs_path).write_text("\n".join(log_lines), encoding="utf-8")

    # Notify Next.js: running
    _send_webhook(task_id, "running", logs_path=logs_path)

    docker_client = docker.from_env()

    try:
        sorted_nodes = sorted(payload.nodes, key=lambda n: payload.nodes.index(n))
        final_output_path = ""

        for idx, node in enumerate(sorted_nodes):
            log_lines.append(f"\n[{idx + 1}/{len(sorted_nodes)}] Running node: {node.model_id}")
            flush_logs()

            success = _run_node(docker_client, node, task_id, log_lines)
            flush_logs()

            if not success:
                error_msg = f"Node {node.model_id} failed (non-zero exit code)"
                log_lines.append(f"[ERROR] {error_msg}")
                flush_logs()
                _send_webhook(task_id, "failed", logs_path=logs_path, error=error_msg)
                return {"status": "failed", "error": error_msg}

            final_output_path = node.output_path

        log_lines.append("\n✓ All nodes completed successfully.")
        flush_logs()

        _send_webhook(
            task_id,
            "completed",
            results_path=final_output_path,
            logs_path=logs_path,
        )
        return {"status": "completed", "results_path": final_output_path}

    except Exception as exc:
        error_msg = traceback.format_exc()
        log_lines.append(f"\n[EXCEPTION]\n{error_msg}")
        flush_logs()
        _send_webhook(task_id, "failed", logs_path=logs_path, error=str(exc))
        raise
