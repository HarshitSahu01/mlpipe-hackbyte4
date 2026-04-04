// src/components/PipelineBuilder.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PipelineBuilder({ models = [], onSuccess }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nodes, setNodes] = useState([]); // { id, modelId, dependsOn: [] }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addNode(modelId) {
    const newId = `node_${Date.now()}`;
    // Default to sequentially depending on the last node, if any
    const defaultDepends = nodes.length > 0 ? [nodes[nodes.length - 1].id] : [];
    
    setNodes((prev) => [
      ...prev,
      { id: newId, modelId, dependsOn: defaultDepends },
    ]);
  }

  function removeNode(id) {
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.id !== id);
      // Remove from downstream dependencies
      return filtered.map((n) => ({
        ...n,
        dependsOn: n.dependsOn.filter((dep) => dep !== id),
      }));
    });
  }

  function toggleDependency(nodeId, depId) {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === nodeId) {
          const hasDep = n.dependsOn.includes(depId);
          return {
            ...n,
            dependsOn: hasDep
              ? n.dependsOn.filter((id) => id !== depId)
              : [...n.dependsOn, depId],
          };
        }
        return n;
      })
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Pipeline name is required"); return; }
    if (nodes.length === 0) { setError("Add at least one model node"); return; }
    setError("");
    setLoading(true);

    try {
      // Calculate `nextNodes` purely based on `dependsOn` state.
      const submitNodes = nodes.map((n) => {
        const nextNodes = nodes
          .filter((other) => other.dependsOn.includes(n.id))
          .map((other) => other.id);

        return {
          id: n.id,
          modelId: n.modelId,
          dependsOn: n.dependsOn,
          nextNodes: nextNodes,
        };
      });

      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), nodes: submitNodes }),
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

  // We allow multiple instances of the same model now since it's a DAG

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
                  // Remove opacity logic to allow duplicates in a DAG
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
                  disabled={m.status !== "ready"}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {nodes.map((node, idx) => {
                const model = models.find((m) => m._id === node.modelId);
                const availableDeps = nodes.slice(0, idx); // Can only depend on preceding nodes to prevent cycles

                return (
                  <div key={node.id} className="card" style={{ display: "flex", flexDirection: "column", padding: "1rem", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
                      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                          {model?.name ?? node.modelId}
                        </span>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {model?.dockerImage}
                        </span>
                      </div>
                      <button type="button" onClick={() => removeNode(node.id)} className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>✕</button>
                    </div>

                    {/* Dependencies Multi-select */}
                    {idx > 0 && (
                      <div style={{ background: "rgba(0,0,0,0.2)", padding: "0.5rem", borderRadius: "6px", fontSize: "0.75rem", border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-secondary)", marginBottom: "0.4rem", fontWeight: 500 }}>
                          Requires output from:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                          {availableDeps.map(dep => {
                            const depModel = models.find((m) => m._id === dep.modelId);
                            const isSelected = node.dependsOn.includes(dep.id);
                            return (
                              <label key={dep.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: isSelected ? "var(--accent-glow)" : "rgba(255,255,255,0.05)", border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)", padding: "0.2rem 0.5rem", borderRadius: "4px", cursor: "pointer", transition: "all 0.2s" }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleDependency(node.id, dep.id)}
                                  style={{ margin: 0 }}
                                />
                                {depModel?.name || "Unknown"}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Arrow connector visualization */}
          {nodes.length > 1 && (
            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Nodes will execute in parallel if they share identical dependencies!
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
