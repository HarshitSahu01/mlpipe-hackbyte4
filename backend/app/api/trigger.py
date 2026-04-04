# backend/app/api/trigger.py
from fastapi import APIRouter, HTTPException
from app.schemas.task import TriggerPayload
from app.workers.tasks import run_inference_pipeline

router = APIRouter()


@router.post("/trigger")
async def trigger_pipeline(payload: TriggerPayload):
    """
    Receive a pipeline execution trigger from Next.js.
    Validates the payload via Pydantic, then dispatches to Celery.
    Returns immediately with the Celery task ID.
    """
    try:
        celery_task = run_inference_pipeline.apply_async(
            args=[payload.model_dump()],
            task_id=f"task-{payload.task_id}",
        )
        return {"celery_task_id": celery_task.id, "status": "queued"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to queue task: {exc}")
