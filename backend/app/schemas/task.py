# backend/app/schemas/task.py
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List


class NodeSpec(BaseModel):
    id: str  # The unique node ID from the frontend DAG (e.g., "node_0")
    model_id: str
    docker_image: str = Field(default="python:3.10-slim")
    model_path: str = Field(default="")
    input_path: str
    output_path: str
    depends_on: List[str] = Field(default_factory=list)
    next_nodes: List[str] = Field(default_factory=list)


class TriggerPayload(BaseModel):
    task_id: str
    pipeline_id: str
    user_id: str
    nodes: List[NodeSpec] = Field(..., min_length=1)
    webhook_url: str = Field(default="http://localhost:3000/api/webhooks/fastapi")


class WebhookPayload(BaseModel):
    task_id: str
    status: str  # "running" | "completed" | "failed"
    results_path: str = ""
    logs_path: str = ""
    error: str = ""
