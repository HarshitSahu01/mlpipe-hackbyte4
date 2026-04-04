# backend/app/api/build.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.workers.build_tasks import build_model_image

router = APIRouter()


class BuildPayload(BaseModel):
    task_id: str
    model_id: str
    zip_path: str
    image_tag: str = ""
    webhook_url: str = ""


@router.post("/build")
async def trigger_build(payload: BuildPayload):
    """
    Receive a model build trigger from Next.js.
    Dispatches a Celery build task and returns the Celery task ID immediately.
    """
    try:
        print(payload.model_dump())
        print(f"build-{payload.task_id}")
        celery_task = build_model_image.apply_async(
            args=[payload.model_dump()],
            task_id=f"build-{payload.task_id}",
        )
        return {"celery_task_id": celery_task.id, "status": "queued"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to queue build task: {exc}")


@router.delete("/build/{image_tag:path}")
async def delete_image(image_tag: str):
    """
    Remove a Docker image from the local registry.
    image_tag: The full tag (e.g. predict-xplore/id:latest)
    """
    import docker
    client = docker.from_env()
    try:
        # Check if image exists before trying to delete
        client.images.get(image_tag)
        client.images.remove(image=image_tag, force=True)
        return {"ok": True, "message": f"Image {image_tag} deleted."}
    except docker.errors.ImageNotFound:
        return {"ok": True, "message": f"Image {image_tag} not found (already gone)."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {exc}")
