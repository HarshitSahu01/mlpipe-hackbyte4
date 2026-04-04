// src/components/TaskLogs.js
"use client";
import { useState, useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export default function TaskLogs({ taskId, initialStatus }) {
  const [task, setTask] = useState(null);
  const [status, setStatus] = useState(initialStatus);
  const [logs, setLogs] = useState("Loading logs…");
  const [resultsPath, setResultsPath] = useState("");
  const [duration, setDuration] = useState(null);
  const logRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    async function fetchTask() {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (!res.ok) return null;
        const { task: t } = await res.json();
        setTask(t);
        setStatus(t.status);
        if (t.resultsPath) setResultsPath(t.resultsPath);
        
        // Calculate duration if completed/failed
        if (t.createdAt && (t.status === "completed" || t.status === "failed")) {
          const start = new Date(t.createdAt);
          const end = t.updatedAt ? new Date(t.updatedAt) : new Date();
          const diffMs = end - start;
          const secs = Math.floor(diffMs / 1000);
          const mins = Math.floor(secs / 60);
          setDuration(mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`);
        }
        
        return t;
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
      const t = await fetchTask();
      await fetchLogs();
      if (t && TERMINAL_STATUSES.has(t.status)) {
        clearInterval(intervalRef.current);
      }
    }

    poll();
    if (!TERMINAL_STATUSES.has(initialStatus)) {
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }
    return () => clearInterval(intervalRef.current);
  }, [taskId, initialStatus]);

  // Auto-scroll to bottom of log panel
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header status info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span className={`badge badge-${status}`} style={{ fontSize: "0.85rem", padding: "0.5rem 0.8rem" }}>
            {status === "running" && <span className="pulse-dot" style={{ marginRight: "6px" }} />}
            {status}
          </span>
          {duration && (
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ fontSize: "1rem" }}>⏱</span> {duration}
            </span>
          )}
        </div>
        
        {status === "completed" && resultsPath && (
          <a
            href={`/api/tasks/${taskId}/results`}
            className="btn btn-primary"
            style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
          >
            ⬇ Download All Results
          </a>
        )}
      </div>

      {/* Log panel */}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "0.75rem" }}>
          <label className="label" style={{ marginBottom: 0 }}>Execution Logs</label>
          {status === "running" && (
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              POLLING...
            </span>
          )}
        </div>
        <div className="log-panel" ref={logRef} style={{ height: "400px", fontSize: "0.82rem" }}>
          {logs}
        </div>
      </div>

      {status === "failed" && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "10px",
            padding: "1rem",
            fontSize: "0.9rem",
            color: "var(--danger)",
            display: "flex",
            gap: "0.75rem",
            alignItems: "center"
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>⚠</span>
          <div>
            <strong>Task Failed</strong>
            <p style={{ fontSize: "0.8rem", marginTop: "0.2rem", opacity: 0.9 }}>Check the logs above for specific error tracebacks.</p>
          </div>
        </div>
      )}

      {status === "completed" && (
        <div
          style={{
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: "10px",
            padding: "1rem",
            fontSize: "0.9rem",
            color: "var(--success)",
            display: "flex",
            gap: "0.75rem",
            alignItems: "center"
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>✓</span>
          <div>
            <strong>Task Completed successfully</strong>
            {resultsPath && (
              <p style={{ fontSize: "0.8rem", marginTop: "0.2rem", color: "var(--text-muted)" }}>
                 Final outputs stored at: <code style={{ color: "var(--text-secondary)" }}>{resultsPath}</code>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
