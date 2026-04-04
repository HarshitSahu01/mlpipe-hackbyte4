# backend/app/core/celery_app.py
from celery import Celery
import os
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "predict_xplore",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.workers.tasks", "app.workers.build_tasks", "app.workers.github_tasks", "app.workers.agent_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,           # Only ack after task completes (safer)
    worker_prefetch_multiplier=1,  # One task at a time per worker process
    result_expires=3600,           # Results kept in Redis for 1 hour
)
