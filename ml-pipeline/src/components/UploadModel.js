// src/components/UploadModel.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const FIELD_TYPES = ["string", "number", "boolean", "file", "json", "image", "audio"];

function IOFieldRow({ field, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <input
        type="text"
        placeholder="Field name"
        value={field.name}
        onChange={(e) => onChange({ ...field, name: e.target.value })}
        style={{ flex: 1 }}
        required
      />
      <select
        value={field.type}
        onChange={(e) => onChange({ ...field, type: e.target.value })}
        style={{ width: "120px" }}
      >
        {FIELD_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        className="btn btn-danger"
        style={{ padding: "0.4rem 0.7rem", flexShrink: 0 }}
        title="Remove field"
      >
        ✕
      </button>
    </div>
  );
}

export default function UploadModel({ onSuccess }) {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1=info, 2=schema, 3=file
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dockerImage, setDockerImage] = useState("python:3.10-slim");
  const [inputs, setInputs] = useState([{ name: "input_data", type: "json" }]);
  const [outputs, setOutputs] = useState([{ name: "prediction", type: "json" }]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addField(setter) {
    setter((prev) => [...prev, { name: "", type: "string" }]);
  }

  function updateField(setter, idx, updated) {
    setter((prev) => prev.map((f, i) => (i === idx ? updated : f)));
  }

  function removeField(setter, idx) {
    setter((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Model name is required"); return; }
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("description", description);
    formData.append("dockerImage", dockerImage);
    formData.append("ioSchema", JSON.stringify({ inputs, outputs }));
    if (file) formData.append("file", file);

    try {
      const res = await fetch("/api/models", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to register model");
      } else {
        onSuccess?.(data.model);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: "600px" }}>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              background: step >= s ? "var(--accent)" : "var(--border)",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Step 1 — Basic info */}
        {step === 1 && (
          <>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Step 1 — Model Info
            </h3>
            <div>
              <label className="label">Model Name *</label>
              <input
                type="text"
                id="model-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sentiment Classifier"
                required
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this model do?"
                rows={3}
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className="label">Docker Image *</label>
              <input
                type="text"
                id="model-docker-image"
                value={dockerImage}
                onChange={(e) => setDockerImage(e.target.value)}
                placeholder="python:3.10-slim"
                required
              />
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                The container used to run this model's inference script.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim()}
              onClick={() => setStep(2)}
              style={{ alignSelf: "flex-end" }}
            >
              Next →
            </button>
          </>
        )}

        {/* Step 2 — IO Schema */}
        {step === 2 && (
          <>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Step 2 — Input / Output Schema
            </h3>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <label className="label" style={{ margin: 0 }}>Inputs</label>
                <button type="button" className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.7rem" }} onClick={() => addField(setInputs)}>
                  + Add
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {inputs.map((f, i) => (
                  <IOFieldRow
                    key={i}
                    field={f}
                    onChange={(updated) => updateField(setInputs, i, updated)}
                    onRemove={() => removeField(setInputs, i)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <label className="label" style={{ margin: 0 }}>Outputs</label>
                <button type="button" className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.7rem" }} onClick={() => addField(setOutputs)}>
                  + Add
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {outputs.map((f, i) => (
                  <IOFieldRow
                    key={i}
                    field={f}
                    onChange={(updated) => updateField(setOutputs, i, updated)}
                    onRemove={() => removeField(setOutputs, i)}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>Next →</button>
            </div>
          </>
        )}

        {/* Step 3 — File upload */}
        {step === 3 && (
          <>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Step 3 — Upload Artifact (optional)
            </h3>
            <div
              style={{
                border: "2px dashed var(--border)",
                borderRadius: "10px",
                padding: "2rem",
                textAlign: "center",
                cursor: "pointer",
                transition: "border-color 0.2s",
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files[0];
                if (dropped) setFile(dropped);
              }}
            >
              <input
                type="file"
                id="model-file"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files[0])}
              />
              <label htmlFor="model-file" style={{ cursor: "pointer" }}>
                {file ? (
                  <div>
                    <div style={{ fontSize: "1.5rem" }}>📎</div>
                    <div style={{ fontWeight: 600, color: "var(--accent-light)", marginTop: "0.5rem" }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {(file.size / 1024).toFixed(1)} KB — click to change
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "2rem" }}>📂</div>
                    <div style={{ fontWeight: 600, marginTop: "0.5rem" }}>
                      Drag & drop or click to select
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Any model artifact (weights, scripts, etc.)
                    </div>
                  </div>
                )}
              </label>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "0.65rem 0.9rem", fontSize: "0.85rem", color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button
                type="submit"
                id="model-submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "Registering…" : "Register Model ✓"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
