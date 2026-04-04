# backend/app/workers/agent_tasks.py
import os
import pathlib
import shutil
import traceback
from typing import Any, Dict
from celery import Task
from dotenv import load_dotenv

from app.core.celery_app import celery_app
from app.workers.build_tasks import build_model_image, _send_build_webhook
from app.workers.log_helpers import TaskLogger
from app.agent.packager import convert_to_ml_pipeline, package_artifacts, extract_primary_script

load_dotenv()

_DEFAULT_SHARED = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "shared_storage"
SHARED_STORAGE_PATH = pathlib.Path(os.getenv("SHARED_STORAGE_PATH", str(_DEFAULT_SHARED))).resolve()
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_WEBHOOK_URL", "http://127.0.0.1:3000/api/webhooks/fastapi")


@celery_app.task(bind=True, name="package_with_agent", max_retries=0)
def package_with_agent(self: Task, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepts raw code (a single Python file or an unstructured ZIP),
    uses the ArmorIQ-secured AI packager to convert it into ML Pipeline format
    (run.py, requirements.txt, DOCKERFILE), and then triggers a Docker build task.

    All phases write to the same unified log file:
      Phase 1 — AI Packager / ArmorIQ
      Phase 2 — uv Dockerfile Patch  (in build_tasks)
      Phase 3 — Docker Build         (in build_tasks)
    """
    task_id    = payload_dict["task_id"]
    model_id   = payload_dict["model_id"]
    input_path = payload_dict["input_path"]
    image_tag  = payload_dict.get("image_tag", f"ml-pipeline/{model_id}:latest")
    webhook_url = payload_dict.get("webhook_url", NEXTJS_WEBHOOK_URL)

    # --- Unified log file (created fresh here, appended by build task) ---
    task_output_dir = SHARED_STORAGE_PATH / "build_logs" / task_id
    task_output_dir.mkdir(parents=True, exist_ok=True)
    logger = TaskLogger(task_output_dir / "build_logs.txt")

    logger.section("🤖  AI Packager Phase  (ArmorIQ + OpenAI)")
    logger.info(f"Model: {model_id}")
    logger.info(f"Input: {input_path}")

    _send_build_webhook(task_id, "running", model_id=model_id, logs_path=logger.path, webhook_url=webhook_url)

    # Redirect packager print() output to the task log
    import builtins
    _original_print = builtins.print

    def _log_print(*args, **kwargs):
        msg = " ".join(str(a) for a in args)
        logger.raw(msg)
        _original_print(*args, **kwargs)

    builtins.print = _log_print

    try:
        logger.info("Extracting raw code...")
        raw_code = extract_primary_script(input_path)
        logger.info(f"Read {len(raw_code)} bytes of source code")

        logger.info("Running ArmorIQ security check + LLM refactoring...")
        artifacts = convert_to_ml_pipeline(raw_code)

        final_source_dir = SHARED_STORAGE_PATH / "models" / model_id / "source"
        if final_source_dir.exists():
            shutil.rmtree(final_source_dir)
        final_source_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Writing generated artifacts to {final_source_dir}")
        package_artifacts(artifacts, str(final_source_dir))

        logger.success("AI Packager complete — standard container structure generated")
        logger.info("Triggering Docker build...")

        build_payload = {
            "task_id":      task_id,
            "model_id":     model_id,
            "context_path": str(final_source_dir),
            "image_tag":    image_tag,
            "webhook_url":  webhook_url,
            "logs_path":    logger.path,   # ← unified log handoff
        }
        build_model_image.apply_async(args=[build_payload], task_id=f"build-{task_id}")

        return {"status": "success", "message": "Code packaged and build triggered"}

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
        # Always restore print
        builtins.print = _original_print
