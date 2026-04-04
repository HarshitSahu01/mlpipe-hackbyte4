// src/components/TaskLogs.js
"use client";
import { useState, useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export default function TaskLogs({ taskId, initialStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [logs, setLogs] = useState("Loading logs…");
  const [resultsPath, setResultsPath] = useState("");
  const [error, setError] = useState("");
  const logRef = useRef(null);
  const intervalRef = useRef(null);

  async function fetchTask() {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) return;
      const { task } = await res.json();
      setStatus(task.status);
      if (task.resultsPath) setResultsPath(task.resultsPath);
      return task;
    } catch {
      return null;
    }
  }

  async function fetchLogs() {
    try {
      const res = await fetch(`/api/tasks/${taskId}/logs`);
      if (res.headers.get("content-type")?.includes("text/plain")) {
        const text = await res.text();
        setLogs(text || "No logs yet.");
      } else {
        const data = await res.json();
        setLogs(data.logs || "No logs yet.");
      }
    } catch {
      setLogs("Failed to fetch logs.");
    }
  }

  async function poll() {
    const task = await fetchTask();
    await fetchLogs();
    if (task && TERMINAL_STATUSES.has(task.status)) {
      clearInterval(intervalRef.current);
    }
  }

  useEffect(() => {
    poll();
    if (!TERMINAL_STATUSES.has(initialStatus)) {
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }
    return () => clearInterval(intervalRef.current);
  }, [taskId]);

  // Auto-scroll to bottom of log panel
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const statusColors = {
    queued: "var(--warning)",
    running: "var(--accent-light)",
    completed: "var(--success)",
    failed: "var(--danger)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <span className={`badge badge-${status}`}>
          {status === "running" && <span className="pulse-dot" />}
          {status}
        </span>
        {status === "running" && (
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Polling every {POLL_INTERVAL_MS / 1000}s…
          </span>
        )}
        {status === "completed" && resultsPath && (
          <a
            href={`/api/tasks/${taskId}/results`}
            className="btn btn-secondary"
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem" }}
          >
            ⬇ Download Results
          </a>
        )}
      </div>

      {/* Log panel */}
      <div>
        <label className="label">Live Logs</label>
        <div className="log-panel" ref={logRef}>
          {logs}
        </div>
      </div>

      {status === "failed" && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            fontSize: "0.85rem",
            color: "var(--danger)",
          }}
        >
          ⚠ Task failed. Check the logs above for details.
        </div>
      )}

      {status === "completed" && (
        <div
          style={{
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            fontSize: "0.85rem",
            color: "var(--success)",
          }}
        >
          ✓ Task completed successfully.
          {resultsPath && (
            <span style={{ marginLeft: "0.5rem", color: "var(--text-muted)", fontSize: "0.78rem" }}>
              Output: {resultsPath}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
