// src/app/tasks/TasksClient.js
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      {status === "running" && <span className="pulse-dot" style={{ marginRight: "4px" }} />}
      {status}
    </span>
  );
}

function TypeBadge({ taskType }) {
  const isBuild = taskType === "build";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "0.72rem",
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: "99px",
      background: isBuild ? "rgba(139,92,246,0.15)" : "rgba(59,130,246,0.15)",
      color: isBuild ? "#a78bfa" : "#60a5fa",
      border: `1px solid ${isBuild ? "rgba(139,92,246,0.3)" : "rgba(59,130,246,0.3)"}`,
    }}>
      {isBuild ? "🔨 build" : "⚡ inference"}
    </span>
  );
}

export default function TasksClient({ tasks: initialTasks, pipelines, preselectedPipelineId }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [showTrigger, setShowTrigger] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState(preselectedPipelineId);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleTrigger(e) {
    e.preventDefault();
    if (!selectedPipeline) { setError("Select a pipeline"); return; }
    setError("");
    setTriggering(true);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId: selectedPipeline }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to trigger task");
      } else {
        const newTask = {
          ...data.task,
          _id: data.task._id?.toString?.() ?? data.task._id,
          pipelineId: pipelines.find((p) => p._id === selectedPipeline) ?? null,
        };
        setTasks((prev) => [newTask, ...prev]);
        setShowTrigger(false);
        router.push(`/tasks/${newTask._id}`);
      }
    } catch {
      setError("Network error");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Tasks</h1>
          <p className="text-secondary" style={{ fontSize: "0.88rem", marginTop: "0.25rem" }}>
            Trigger inference tasks and monitor model builds.
          </p>
        </div>
        <button
          id="new-task-btn"
          className="btn btn-primary"
          onClick={() => setShowTrigger((v) => !v)}
        >
          {showTrigger ? "✕ Cancel" : "⚡ Run Task"}
        </button>
      </div>

      {/* Trigger form */}
      {showTrigger && (
        <div className="card" style={{ maxWidth: "480px", marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Trigger Inference Task</h2>
          <form onSubmit={handleTrigger} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label className="label">Select Pipeline</label>
              <select
                id="task-pipeline-select"
                value={selectedPipeline}
                onChange={(e) => setSelectedPipeline(e.target.value)}
                required
              >
                <option value="">— Choose a pipeline —</option>
                {pipelines.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "0.65rem 0.9rem", fontSize: "0.85rem", color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <button
              id="task-submit"
              type="submit"
              className="btn btn-primary"
              disabled={triggering}
            >
              {triggering ? "Dispatching…" : "⚡ Run Now"}
            </button>
          </form>
        </div>
      )}

      {/* Tasks table */}
      {tasks.length === 0 && !showTrigger ? (
        <div className="card" style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚡</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>No tasks yet</div>
          <div style={{ fontSize: "0.88rem" }}>Trigger your first inference task above, or register a model to start a build.</div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Type</th>
                <th>Context</th>
                <th>Status</th>
                <th>Celery ID</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const isBuild = task.taskType === "build";
                const contextName = isBuild
                  ? (task.modelId?.name ? `🔨 ${task.modelId.name}` : "Model Build")
                  : (task.pipelineId?.name ?? "—");
                return (
                  <tr key={task._id}>
                    <td>
                      <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {task._id.slice(-8)}
                      </code>
                    </td>
                    <td><TypeBadge taskType={task.taskType || "inference"} /></td>
                    <td style={{ fontSize: "0.85rem" }}>{contextName}</td>
                    <td><StatusBadge status={task.status} /></td>
                    <td>
                      {task.celeryTaskId ? (
                        <code style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {task.celeryTaskId.slice(0, 16)}…
                        </code>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-muted" style={{ fontSize: "0.8rem" }}>
                      {mounted && task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                    </td>
                    <td>
                      <Link
                        href={`/tasks/${task._id}`}
                        style={{ fontSize: "0.8rem", color: "var(--accent-light)" }}
                      >
                        View logs →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
