# backend/app/schemas/model.py
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional


class IOField(BaseModel):
    name: str
    type: str
    description: str = ""


class IOSchema(BaseModel):
    inputs: List[IOField] = []
    outputs: List[IOField] = []


class ModelSpec(BaseModel):
    model_id: str
    name: str
    docker_image: str = Field(default="python:3.10-slim")
    model_path: str = ""
    io_schema: IOSchema = Field(default_factory=IOSchema)
