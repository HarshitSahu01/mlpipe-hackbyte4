# backend/app/workers/log_helpers.py
"""
Shared logging utilities for all ML Pipeline Celery workers.

The unified log file for a task lives at:
    shared_storage/build_logs/{task_id}/build_logs.txt

Every worker phase (GitHub pull, AI packager, uv patching, Docker build)
APPENDS to this same file so the frontend sees a single continuous stream.
"""
from __future__ import annotations

import pathlib
import datetime


class TaskLogger:
    """
    Thread-safe, append-only logger that writes every line immediately to disk.
    Pass one instance through all worker phases for a single task.
    """

    def __init__(self, logs_path: str | pathlib.Path):
        self.logs_path = pathlib.Path(logs_path)
        self.logs_path.parent.mkdir(parents=True, exist_ok=True)
        # Create / truncate the file on first init
        self.logs_path.write_text("", encoding="utf-8")

    def _ts(self) -> str:
        return datetime.datetime.now().strftime("%H:%M:%S")

    def append(self, line: str) -> None:
        """Append a single line to the log file immediately (no buffering)."""
        with open(self.logs_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    def section(self, title: str) -> None:
        """Write a visible section header."""
        separator = "─" * 58
        self.append(f"\n┌{separator}┐")
        self.append(f"│  {title:<56}│")
        self.append(f"└{separator}┘")

    def info(self, msg: str) -> None:
        self.append(f"[{self._ts()}] {msg}")

    def success(self, msg: str) -> None:
        self.append(f"[{self._ts()}] ✅  {msg}")

    def warn(self, msg: str) -> None:
        self.append(f"[{self._ts()}] ⚠️   {msg}")

    def error(self, msg: str) -> None:
        self.append(f"[{self._ts()}] ❌  {msg}")

    def raw(self, msg: str) -> None:
        """Write a raw line with no timestamp (for Docker build output)."""
        self.append(msg)

    @property
    def path(self) -> str:
        return str(self.logs_path)
