// src/components/PipelineBuilder.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PipelineBuilder({ models = [], onSuccess }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nodes, setNodes] = useState([]); // { modelId, order, inputMappings }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addNode(modelId) {
    if (nodes.find((n) => n.modelId === modelId)) return; // prevent duplicates for simplicity
    setNodes((prev) => [
      ...prev,
      { modelId, order: prev.length, inputMappings: {} },
    ]);
  }

  function removeNode(idx) {
    setNodes((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((n, i) => ({ ...n, order: i }))
    );
  }

  function moveNode(idx, dir) {
    setNodes((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((n, i) => ({ ...n, order: i }));
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Pipeline name is required"); return; }
    if (nodes.length === 0) { setError("Add at least one model node"); return; }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), nodes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create pipeline");
      } else {
        onSuccess?.(data.pipeline);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const usedIds = new Set(nodes.map((n) => n.modelId));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
      {/* Left — model library */}
      <div>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
          AVAILABLE MODELS
        </h3>
        {models.length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
            No models registered yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {models.map((m) => (
              <div
                key={m._id}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.85rem 1rem",
                  opacity: usedIds.has(m._id) ? 0.4 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{m.dockerImage}</div>
                </div>
                <span className={`badge badge-${m.status}`}>{m.status}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem", flexShrink: 0 }}
                  disabled={usedIds.has(m._id) || m.status !== "ready"}
                  onClick={() => addNode(m._id)}
                  title={m.status !== "ready" ? "Model not ready" : "Add to pipeline"}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right — pipeline canvas */}
      <div>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
          PIPELINE
        </h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="label">Pipeline Name</label>
            <input
              id="pipeline-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sentiment → Summary"
              required
            />
          </div>

          {/* Node list */}
          {nodes.length === 0 ? (
            <div
              style={{
                border: "2px dashed var(--border)",
                borderRadius: "10px",
                padding: "2rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
              }}
            >
              ← Add a model to start building
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {nodes.map((node, idx) => {
                const model = models.find((m) => m._id === node.modelId);
                return (
                  <div key={node.modelId} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: "var(--accent-glow)",
                        border: "1px solid var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: "var(--accent-light)",
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div
                      className="card"
                      style={{
                        flex: 1,
                        padding: "0.65rem 1rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "0.88rem", flex: 1 }}>
                        {model?.name ?? node.modelId}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {model?.dockerImage}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <button type="button" onClick={() => moveNode(idx, -1)} disabled={idx === 0} style={{ fontSize: "0.7rem", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}>▲</button>
                      <button type="button" onClick={() => moveNode(idx, 1)} disabled={idx === nodes.length - 1} style={{ fontSize: "0.7rem", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}>▼</button>
                    </div>
                    <button type="button" onClick={() => removeNode(idx)} className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Arrow connector visualization */}
          {nodes.length > 1 && (
            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Output of each node feeds into the next node's input.
            </div>
          )}

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "0.65rem 0.9rem", fontSize: "0.85rem", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <button
            id="pipeline-submit"
            type="submit"
            className="btn btn-primary"
            disabled={loading || nodes.length === 0}
          >
            {loading ? "Creating…" : "Create Pipeline ✓"}
          </button>
        </form>
      </div>
    </div>
  );
}
