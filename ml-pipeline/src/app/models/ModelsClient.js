// src/app/models/ModelsClient.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadModel from "@/components/UploadModel";

export default function ModelsClient({ models: initialModels }) {
  const [models, setModels] = useState(initialModels);
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  function handleSuccess(newModel) {
    setModels((prev) => [{ ...newModel, _id: newModel._id?.toString?.() ?? newModel._id }, ...prev]);
    setShowForm(false);
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
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {models.map((m) => (
            <div key={m._id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, lineHeight: 1.3 }}>{m.name}</h2>
                <span className={`badge badge-${m.status}`}>{m.status}</span>
              </div>

              {m.description && (
                <p className="text-secondary" style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
                  {m.description}
                </p>
              )}

              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                🐳 {m.dockerImage}
              </div>

              {m.ioSchema?.inputs?.length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <span style={{ fontWeight: 600 }}>Inputs:</span>{" "}
                  {m.ioSchema.inputs.map((f) => `${f.name}:${f.type}`).join(", ")}
                </div>
              )}
              {m.ioSchema?.outputs?.length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <span style={{ fontWeight: 600 }}>Outputs:</span>{" "}
                  {m.ioSchema.outputs.map((f) => `${f.name}:${f.type}`).join(", ")}
                </div>
              )}

              <div style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Registered {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
