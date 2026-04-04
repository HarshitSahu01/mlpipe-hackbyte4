# backend/app/api/build.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.workers.build_tasks import build_model_image
from app.workers.github_tasks import pull_from_github
from app.workers.agent_tasks import package_with_agent

router = APIRouter()


class BuildPayload(BaseModel):
    task_id: str
    model_id: str
    zip_path: str = ""
    context_path: str = ""
    image_tag: str = ""
    webhook_url: str = ""


class GitHubPullPayload(BaseModel):
    task_id: str
    model_id: str
    repo_url: str
    branch: str = "main"
    model_root: str = ""
    dockerfile_folder: str = "docker"
    image_tag: str = ""
    webhook_url: str = ""


@router.post("/build")
async def trigger_build(payload: BuildPayload):
    """
    Receive a model build trigger from Next.js.
    """
    try:
        celery_task = build_model_image.apply_async(
            args=[payload.model_dump()],
            task_id=f"build-{payload.task_id}",
        )
        return {"celery_task_id": celery_task.id, "status": "queued"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to queue build task: {exc}")


@router.post("/github-pull")
async def trigger_github_pull(payload: GitHubPullPayload):
    """
    Trigger a repository pull from GitHub and subsequent Docker build.
    """
    try:
        celery_task = pull_from_github.apply_async(
            args=[payload.model_dump()],
            task_id=f"pull-{payload.task_id}",
        )
        return {"celery_task_id": celery_task.id, "status": "queued"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to queue pull task: {exc}")


class AgentPackagePayload(BaseModel):
    task_id: str
    model_id: str
    input_path: str
    image_tag: str = ""
    webhook_url: str = ""

@router.post("/agent-package")
async def trigger_agent_package(payload: AgentPackagePayload):
    """
    Trigger the AI agent packager to refactor raw code instead of pulling from Github or ZIP.
    """
    try:
        celery_task = package_with_agent.apply_async(
            args=[payload.model_dump()],
            task_id=f"agent-{payload.task_id}",
        )
        return {"celery_task_id": celery_task.id, "status": "queued"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to queue agent task: {exc}")


@router.delete("/build/{image_tag:path}")
async def delete_image(image_tag: str):
    """
    Remove a Docker image from the local registry.
    image_tag: The full tag (e.g. ml-pipeline/id:latest)
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
