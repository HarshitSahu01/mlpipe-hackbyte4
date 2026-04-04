// src/app/pipelines/PipelinesClient.js
"use client";
import { useState } from "react";
import PipelineBuilder from "@/components/PipelineBuilder";
import Link from "next/link";

export default function PipelinesClient({ pipelines: initialPipelines, models }) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [showBuilder, setShowBuilder] = useState(false);

  function handleSuccess(newPipeline) {
    setPipelines((prev) => [
      {
        ...newPipeline,
        _id: newPipeline._id?.toString?.() ?? newPipeline._id,
        nodes: (newPipeline.nodes ?? []).map((n) => ({
          ...n,
          modelId: n.modelId?.toString?.() ?? n.modelId,
        })),
      },
      ...prev,
    ]);
    setShowBuilder(false);
  }

  async function handleDelete(pipelineId) {
    if (!confirm("Are you sure you want to delete this pipeline? History of tasks for this pipeline will also be removed.")) return;
    
    try {
      const res = await fetch(`/api/pipelines/${pipelineId}`, { method: "DELETE" });
      if (res.ok) {
        setPipelines((prev) => prev.filter((p) => p._id !== pipelineId));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete pipeline.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("An error occurred while deleting the pipeline.");
    }
  }

  return (
    <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Pipelines</h1>
          <p className="text-secondary" style={{ fontSize: "0.88rem", marginTop: "0.25rem" }}>
            Chain ML models into sequential inference pipelines.
          </p>
        </div>
        <button
          id="new-pipeline-btn"
          className="btn btn-primary"
          onClick={() => setShowBuilder((v) => !v)}
        >
          {showBuilder ? "✕ Cancel" : "+ New Pipeline"}
        </button>
      </div>

      {showBuilder && (
        <div style={{ marginBottom: "2rem" }}>
          <PipelineBuilder models={models} onSuccess={handleSuccess} />
        </div>
      )}

      {pipelines.length === 0 && !showBuilder ? (
        <div className="card" style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⟳</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>No pipelines yet</div>
          <div style={{ fontSize: "0.88rem" }}>Create your first pipeline using the button above.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
          {pipelines.map((p) => {
            const nodeModels = p.nodes.map((n) => models.find((m) => m._id === n.modelId));
            return (
              <div key={p._id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>{p.name}</h2>

                  {/* Node chain visualization */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                    {nodeModels.map((m, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span
                          style={{
                            background: "var(--accent-glow)",
                            border: "1px solid var(--border-active)",
                            borderRadius: "6px",
                            padding: "0.2rem 0.5rem",
                            fontSize: "0.75rem",
                            color: "var(--accent-light)",
                          }}
                        >
                          {m?.name ?? "Unknown"}
                        </span>
                        {i < nodeModels.length - 1 && (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      {p.nodes.length} node{p.nodes.length !== 1 ? "s" : ""} •{" "}
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}
                    </span>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      <button
                        onClick={() => handleDelete(p._id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--danger)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                      <Link
                        href={`/pipelines/${p._id}/run`}
                        className="btn btn-primary"
                        style={{ fontSize: "0.78rem", padding: "0.35rem 0.9rem" }}
                      >
                        ⚡ Run
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
