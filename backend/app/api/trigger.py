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


@router.post("/cancel")
async def cancel_task(payload: dict):
    """
    Revoke a running Celery task.
    Expects: {"celery_task_id": "..."}
    """
    task_id = payload.get("celery_task_id")
    if not task_id:
        raise HTTPException(status_code=400, detail="celery_task_id is required")
    
    try:
        from app.core.celery_app import celery_app
        # terminate=True forces the worker to kill the child process executing the task
        celery_app.control.revoke(task_id, terminate=True)
        return {"status": "cancelled", "celery_task_id": task_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to cancel task: {exc}")
