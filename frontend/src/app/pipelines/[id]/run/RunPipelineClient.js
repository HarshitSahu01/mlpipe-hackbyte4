// src/app/pipelines/[id]/run/RunPipelineClient.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RunPipelineClient({ pipeline, models }) {
  const [file, setFile] = useState(null);
  const [isZip, setIsZip] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const nodeModels = pipeline.nodes.map(n => models.find(m => m._id === n.modelId));

  async function handleRun(e) {
    e.preventDefault();
    if (!file) {
      setError("Please select an input file or ZIP archive.");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("isZip", isZip.toString());

    try {
      const res = await fetch(`/api/pipelines/${pipeline._id}/run`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        // Redirect to the new task detail page
        router.push(`/tasks/${data.taskId}`);
      } else {
        setError(data.error || "Failed to start pipeline run.");
      }
    } catch (err) {
      console.error("Run error:", err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: "2rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <Link href="/pipelines" className="text-secondary" style={{ fontSize: "0.85rem", textDecoration: "none" }}>
          ← Back to Pipelines
        </Link>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.5rem" }}>Run Pipeline: {pipeline.name}</h1>
        <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
          Configure the input data and launch the sequential inference process.
        </p>
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "1.5rem", marginBottom: "2.5rem", border: "1px solid var(--border)" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
          Pipeline Structure
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {nodeModels.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ background: "var(--accent-glow)", border: "1px dashed var(--border-active)", padding: "0.6rem 1rem", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--accent-light)", fontWeight: 700 }}>NODE {i+1}</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{m?.name ?? "Unknown"}</div>
              </div>
              {i < nodeModels.length - 1 && <span style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>⟶</span>}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleRun}>
        <div style={{ marginBottom: "2rem" }}>
          <label className="label">Input Data Type</label>
          <div style={{ display: "flex", gap: "2rem", marginTop: "0.5rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input type="radio" checked={isZip} onChange={() => setIsZip(true)} />
              <span>ZIP Archive (Extracted to /input)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input type="radio" checked={!isZip} onChange={() => setIsZip(false)} />
              <span>Single File (Placed in /input)</span>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: "2rem" }}>
          <label className="label">Upload File</label>
          <div style={{
            border: "2px dashed var(--border)",
            borderRadius: "12px",
            padding: "2rem",
            textAlign: "center",
            position: "relative",
            background: file ? "rgba(var(--accent-light-rgb), 0.05)" : "transparent",
            borderColor: file ? "var(--accent-light)" : "var(--border)"
          }}>
            <input 
              type="file" 
              onChange={(e) => setFile(e.target.files[0])}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            />
            {file ? (
              <div>
                <div style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>📄</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{file.name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>📁</div>
                <div style={{ fontSize: "0.95rem" }}>Click or drag to upload input {isZip ? "ZIP" : "file"}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Maximum size: 50MB</div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ color: "var(--danger)", fontSize: "0.88rem", marginBottom: "1.5rem", padding: "0.75rem", background: "rgba(239,68,68,0.1)", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)" }}>
            ⚠ {error}
          </div>
        )}

        <button 
          type="submit" 
          disabled={loading} 
          className="btn btn-primary" 
          style={{ width: "100%", padding: "1rem", fontSize: "1rem", fontWeight: 700 }}
        >
          {loading ? "Starting Task..." : "⚡ Launch Pipeline"}
        </button>
      </form>
    </div>
  );
}
