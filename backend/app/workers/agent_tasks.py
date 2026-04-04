import os
import pathlib
import shutil
import traceback
from typing import Any, Dict
from celery import Task

from app.core.celery_app import celery_app
from app.workers.build_tasks import build_model_image, _send_build_webhook
from app.agent.packager import convert_to_predict_xplore, package_artifacts, extract_primary_script

_DEFAULT_SHARED = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "shared_storage"
SHARED_STORAGE_PATH = pathlib.Path(os.getenv("SHARED_STORAGE_PATH", str(_DEFAULT_SHARED))).resolve()
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_WEBHOOK_URL", "http://127.0.0.1:3000/api/webhooks/fastapi")

@celery_app.task(bind=True, name="package_with_agent", max_retries=0)
def package_with_agent(self: Task, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepts raw code (a single Python file or an unstructured ZIP),
    uses the AI packager to convert it into Predict-Xplore format (run.py, requirements.txt, DOCKERFILE),
    and then triggers a Docker build task.
    """
    task_id = payload_dict["task_id"]
    model_id = payload_dict["model_id"]
    input_path = payload_dict["input_path"]
    image_tag = payload_dict.get("image_tag", f"predict-xplore/{model_id}:latest")
    webhook_url = payload_dict.get("webhook_url", NEXTJS_WEBHOOK_URL)

    task_output_dir = SHARED_STORAGE_PATH / "build_logs" / task_id
    task_output_dir.mkdir(parents=True, exist_ok=True)
    logs_path = str(task_output_dir / "build_logs.txt")

    log_lines = [
        f"[agent] Starting AI Packager for model {model_id}",
        f"[agent] Input path: {input_path}"
    ]

    def flush_logs():
        pathlib.Path(logs_path).write_text("\n".join(log_lines), encoding="utf-8")

    flush_logs()
    _send_build_webhook(task_id, "running", model_id=model_id, logs_path=logs_path, webhook_url=webhook_url)

    try:
        log_lines.append("[agent] Extracting raw code...")
        flush_logs()
        raw_code = extract_primary_script(input_path)

        log_lines.append(f"[agent] Running AI refactoring on {len(raw_code)} bytes...")
        flush_logs()
        artifacts = convert_to_predict_xplore(raw_code)

        final_source_dir = SHARED_STORAGE_PATH / "models" / model_id / "source"
        if final_source_dir.exists():
            shutil.rmtree(final_source_dir)
        final_source_dir.mkdir(parents=True, exist_ok=True)

        log_lines.append(f"[agent] Packaging generated artifacts into {final_source_dir}...")
        flush_logs()
        package_artifacts(artifacts, str(final_source_dir))

        log_lines.append("[agent] Successfully generated standard container. Triggering build...")
        flush_logs()

        build_payload = {
            "task_id": task_id,
            "model_id": model_id,
            "context_path": str(final_source_dir),
            "image_tag": image_tag,
            "webhook_url": webhook_url
        }

        build_model_image.apply_async(args=[build_payload], task_id=f"build-{task_id}")

        return {"status": "success", "message": "Code packaged and build triggered"}

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
