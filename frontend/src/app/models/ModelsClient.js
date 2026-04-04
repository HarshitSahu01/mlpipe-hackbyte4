// src/app/models/ModelsClient.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadModel from "@/components/UploadModel";

export default function ModelsClient({ models: initialModels }) {
  const [models, setModels] = useState(initialModels);
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  async function handleDelete(modelId) {
    if (!confirm("Are you sure you want to delete this model? This will also remove the Docker image and all associated build logs.")) return;
    
    try {
      const res = await fetch(`/api/models/${modelId}`, { method: "DELETE" });
      if (res.ok) {
        setModels((prev) => prev.filter((m) => m._id !== modelId));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete model.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("An error occurred while deleting the model.");
    }
  }

  return (
    <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Models</h1>
          <p className="text-secondary" style={{ fontSize: "0.88rem", marginTop: "0.25rem" }}>
            Register and manage your Docker-based ML models.
          </p>
        </div>
        <button
          id="new-model-btn"
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "✕ Cancel" : "+ Register Model"}
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div style={{ marginBottom: "2rem" }}>
          <UploadModel onSuccess={handleSuccess} />
        </div>
      )}

      {/* Model grid */}
      {models.length === 0 && !showForm ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>◈</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            No models yet
          </div>
          <div style={{ fontSize: "0.88rem" }}>
            Register your first Docker-based ML model above.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {models.map((m) => (
            <div key={m._id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, lineHeight: 1.3 }}>{m.name}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className={`badge badge-${m.status}`}>
                      {m.status === "building" && <span className="pulse-dot" style={{ marginRight: "4px" }} />}
                      {m.status === "ready" ? "success" : m.status}
                    </span>
                  </div>
                </div>

                {m.description && (
                  <p className="text-secondary" style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
                    {m.description}
                  </p>
                )}

                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontFamily: "var(--font-mono)" }}>
                  🐳 {m.dockerImage}
                </div>

                {m.ioSchema?.inputs?.length > 0 && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>IN:</span>{" "}
                    {m.ioSchema.inputs.map((f) => f.name).join(", ")}
                  </div>
                )}
                {m.ioSchema?.outputs?.length > 0 && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-muted)" }}>OUT:</span>{" "}
                    {m.ioSchema.outputs.map((f) => f.name).join(", ")}
                  </div>
                )}
              </div>

              <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"}
                    </span>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      {m.buildTaskId && (
                        <a
                          href={`/tasks/${m.buildTaskId}`}
                          style={{ fontSize: "0.7rem", color: "var(--accent-light)", textDecoration: "none" }}
                          title="View Logs"
                        >
                          Logs
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(m._id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--danger)",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
