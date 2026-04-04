// src/components/UploadModel.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const FIELD_TYPES = ["string", "number", "boolean", "file", "json", "image", "audio"];

// Curated base images — slim Python runtimes most commonly used for ML inference
const DOCKER_IMAGE_OPTIONS = [
  { value: "python:3.10-slim", label: "Python 3.10 Slim  (recommended)" },
  { value: "python:3.11-slim", label: "Python 3.11 Slim" },
  { value: "python:3.12-slim", label: "Python 3.12 Slim" },
];

// Required files that must exist in the root of the uploaded ZIP
const REQUIRED_FILES = ["run.py", "requirements.txt", "DOCKERFILE"];

/** Check ZIP magic bytes: 50 4B 03 04 */
function isZipBuffer(buffer) {
  return (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/**
 * Quick scan of a ZIP buffer's local file headers to collect entry names.
 * The local file header signature is 0x504B0304.
 */
function listZipEntries(buffer) {
  const names = [];
  let offset = 0;
  while (offset + 30 < buffer.length) {
    // Local file header signature
    if (
      buffer[offset] === 0x50 &&
      buffer[offset + 1] === 0x4b &&
      buffer[offset + 2] === 0x03 &&
      buffer[offset + 3] === 0x04
    ) {
      const fnLen = buffer[offset + 26] | (buffer[offset + 27] << 8);
      const extraLen = buffer[offset + 28] | (buffer[offset + 29] << 8);
      const compressedSize =
        buffer[offset + 18] |
        (buffer[offset + 19] << 8) |
        (buffer[offset + 20] << 16) |
        (buffer[offset + 21] << 24);

      const nameBytes = buffer.slice(offset + 30, offset + 30 + fnLen);
      const name = new TextDecoder().decode(nameBytes);
      names.push(name);
      offset += 30 + fnLen + extraLen + compressedSize;
    } else {
      // Skip byte by byte once we drift off a header (handles end-of-central-directory)
      offset++;
    }
  }
  return names;
}

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
  const [dockerImage, setDockerImage] = useState(DOCKER_IMAGE_OPTIONS[0].value);
  const [inputs, setInputs] = useState([{ name: "input_data", type: "json" }]);
  const [outputs, setOutputs] = useState([{ name: "prediction", type: "json" }]);
  const [file, setFile] = useState(null);
  const [zipError, setZipError] = useState("");
  const [useAiPackager, setUseAiPackager] = useState(false);
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

  async function validateAndSetFile(selected) {
    setZipError("");
    if (!selected) { setFile(null); return; }

    // Extension check
    const isPyFile = selected.name.toLowerCase().endsWith(".py");
    const isZipFile = selected.name.toLowerCase().endsWith(".zip");

    if (!isZipFile && !isPyFile) {
      setZipError("File must be a .zip archive or a .py script.");
      setFile(null);
      return;
    }

    if (isPyFile) {
      setUseAiPackager(true);
      setFile(selected);
      return;
    }

    if (useAiPackager && isZipFile) {
        setFile(selected);
        return;
    }

    // Read and validate magic bytes + required entries
    try {
      const arrayBuf = await selected.arrayBuffer();
      const buf = new Uint8Array(arrayBuf);

      if (!isZipBuffer(buf)) {
        setZipError("File does not appear to be a valid ZIP archive.");
        setFile(null);
        return;
      }

      const entries = listZipEntries(buf);
      // Accept both root-level ("run.py" / "inference.py") and single-folder-prefixed ("model/run.py")
      const hasRunFile = entries.some(e => {
        const base = e.split("/").pop().toLowerCase();
        return base === "run.py" || base === "inference.py";
      });
      const hasRequirements = entries.some(e => e.split("/").pop().toLowerCase() === "requirements.txt");
      const hasDockerfile = entries.some(e => e.split("/").pop().toLowerCase() === "dockerfile");

      const missing = [];
      if (!hasRunFile) missing.push("run.py (or inference.py)");
      if (!hasRequirements) missing.push("requirements.txt");
      if (!hasDockerfile) missing.push("DOCKERFILE");

      if (missing.length > 0) {
        setZipError(`ZIP is missing required file(s): ${missing.join(", ")}`);
        setFile(null);
        return;
      }

      setFile(selected);
    } catch {
      setZipError("Could not read the file. Ensure it is a valid ZIP.");
      setFile(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Model name is required"); return; }
    if (!file) { setError("A model ZIP package is required."); return; }
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("description", description);
    formData.append("dockerImage", dockerImage);
    formData.append("ioSchema", JSON.stringify({ inputs, outputs }));
    formData.append("useAiPackager", useAiPackager);
    formData.append("file", file);

    try {
      const res = await fetch("/api/models", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to register model");
      } else {
        // Pass both the model and buildTaskId so the parent can navigate to build logs
        onSuccess?.(data.model, data.buildTaskId);
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
              <label className="label">Base Docker Image *</label>
              <select
                id="model-docker-image"
                value={dockerImage}
                onChange={(e) => setDockerImage(e.target.value)}
              >
                {DOCKER_IMAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Base Python runtime used to run your inference script.
                Your <code>DOCKERFILE</code> inside the ZIP can extend this further.
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

        {/* Step 3 — ZIP upload */}
        {step === 3 && (
          <>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Step 3 — Upload Model Package *
            </h3>

            {/* Format spec box */}
            <div
              style={{
                background: "rgba(108,71,255,0.07)",
                border: "1px solid rgba(108,71,255,0.25)",
                borderRadius: "8px",
                padding: "0.85rem 1rem",
                fontSize: "0.8rem",
                lineHeight: 1.7,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "0.35rem", color: "var(--accent-light)" }}>
                📦 Required ZIP structure
              </div>
              <div style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>
                <div>📄 <strong>run.py</strong> <em>(or inference.py)</em> — entry point</div>
                <div>📄 <strong>requirements.txt</strong> — Python dependencies</div>
                <div>📄 <strong>DOCKERFILE</strong> — defines the container</div>
                <div>📁 <em>weights/, configs/, ...</em> — any model artifacts</div>
              </div>
              <div style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                <strong>run.py contract:</strong>{" "}
                reads <code>$INPUT_PATH</code> (JSON), writes to <code>$OUTPUT_PATH</code> (JSON).
                Optionally loads weights from <code>$MODEL_PATH</code>.
              </div>
            </div>

            {/* Drop zone */}
            <div
              style={{
                border: `2px dashed ${zipError ? "var(--danger)" : file ? "var(--accent)" : "var(--border)"}`,
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
                if (dropped) validateAndSetFile(dropped);
              }}
            >
              <input
                type="file"
                id="model-file"
                accept=".zip,application/zip,application/x-zip-compressed,.py"
                style={{ display: "none" }}
                onChange={(e) => validateAndSetFile(e.target.files[0])}
              />
              <label htmlFor="model-file" style={{ cursor: "pointer" }}>
                {file ? (
                  <div>
                    <div style={{ fontSize: "1.5rem" }}>✅</div>
                    <div style={{ fontWeight: 600, color: "var(--accent-light)", marginTop: "0.5rem" }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {(file.size / 1024).toFixed(1)} KB — {useAiPackager ? "AI Packager Mode" : "valid ZIP with all required files"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      click to change
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "2rem" }}>📦</div>
                    <div style={{ fontWeight: 600, marginTop: "0.5rem" }}>
                      Drag &amp; drop or click to select
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      .zip or .py — AI Agent can restructure raw code
                    </div>
                  </div>
                )}
              </label>
            </div>
            
            <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input 
                type="checkbox" 
                id="use-ai" 
                checked={useAiPackager}
                onChange={(e) => {
                  setUseAiPackager(e.target.checked);
                  if (file) validateAndSetFile(file); // re-validate with new setting
                }}
              />
              <label htmlFor="use-ai" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Use AI Packager (Auto-restructure code to ML Pipeline format)
              </label>
            </div>

            {/* ZIP validation error */}
            {zipError && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "0.65rem 0.9rem", fontSize: "0.85rem", color: "var(--danger)" }}>
                ⚠ {zipError}
              </div>
            )}

            {/* Submission error */}
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
                disabled={loading || !file}
              >
                {loading ? "Queuing Build…" : "🔨 Build & Register"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
