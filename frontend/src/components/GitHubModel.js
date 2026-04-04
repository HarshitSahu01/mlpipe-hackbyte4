// src/components/GitHubModel.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import GitHubRepoTree from "./GitHubRepoTree";

const FIELD_TYPES = ["string", "number", "boolean", "file", "json", "image", "audio"];
const DOCKER_IMAGE_OPTIONS = [
  { value: "python:3.10-slim", label: "Python 3.10 Slim  (recommended)" },
  { value: "python:3.11-slim", label: "Python 3.11 Slim" },
  { value: "python:3.12-slim", label: "Python 3.12 Slim" },
];

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

export default function GitHubModel({ onSuccess }) {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1=info, 2=schema, 3=github
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dockerImage, setDockerImage] = useState(DOCKER_IMAGE_OPTIONS[0].value);
  const [inputs, setInputs] = useState([{ name: "input_data", type: "json" }]);
  const [outputs, setOutputs] = useState([{ name: "prediction", type: "json" }]);

  // GitHub specifically
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [modelRoot, setModelRoot] = useState(null);
  const [branches, setBranches] = useState([]);
  const [fetchingBranches, setFetchingBranches] = useState(false);
  const [showTree, setShowTree] = useState(false);

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

  async function fetchBranches() {
    if (!repoUrl) return;
    setFetchingBranches(true);
    setError("");
    try {
      const repoPath = repoUrl.replace("https://github.com/", "").replace(/\/+$/, "");
      const endpoint = `https://api.github.com/repos/${repoPath}/branches`;
      const res = await fetch(`/api/github/proxy?endpoint=${encodeURIComponent(endpoint)}`);
      if (!res.ok) throw new Error("Could not fetch branches. Is the repo public?");
      const data = await res.json();
      setBranches(data.map(b => b.name));
      if (data.length > 0 && !data.find(b => b.name === branch)) {
         setBranch(data[0].name);
      }
      setShowTree(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetchingBranches(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Model name is required"); return; }
    if (!repoUrl) { setError("GitHub Repo URL is required"); return; }
    setError("");
    setLoading(true);

    const payload = {
       name: name.trim(),
       description,
       dockerImage,
       ioSchema: { inputs, outputs },
       repoUrl: repoUrl.trim(),
       branch,
       modelRoot
    };

    try {
      const res = await fetch("/api/models/github", { 
         method: "POST", 
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(payload) 
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to register model");
      } else {
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
            <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Step 1 — Model Info</h3>
            <div>
              <label className="label">Model Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Llama Classifier" required />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this model do?" rows={3} />
            </div>
            <div>
              <label className="label">Base Docker Image *</label>
              <select value={dockerImage} onChange={(e) => setDockerImage(e.target.value)}>
                {DOCKER_IMAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => setStep(2)} style={{ alignSelf: "flex-end" }}>Next →</button>
          </>
        )}

        {/* Step 2 — IO Schema */}
        {step === 2 && (
          <>
            <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Step 2 — Input / Output Schema</h3>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <label className="label">Inputs</label>
                <button type="button" className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.7rem" }} onClick={() => addField(setInputs)}>+ Add</button>
              </div>
              {inputs.map((f, i) => <IOFieldRow key={i} field={f} onChange={(v) => updateField(setInputs, i, v)} onRemove={() => removeField(setInputs, i)} />)}
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <label className="label">Outputs</label>
                <button type="button" className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.7rem" }} onClick={() => addField(setOutputs)}>+ Add</button>
              </div>
              {outputs.map((f, i) => <IOFieldRow key={i} field={f} onChange={(v) => updateField(setOutputs, i, v)} onRemove={() => removeField(setOutputs, i)} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>Next →</button>
            </div>
          </>
        )}

        {/* Step 3 — GitHub details */}
        {step === 3 && (
          <>
            <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Step 3 — Repository Source</h3>
            
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <div style={{ flex: 1 }}>
                <label className="label">GitHub Repository URL *</label>
                <input 
                   type="url" 
                   value={repoUrl} 
                   onChange={(e) => setRepoUrl(e.target.value)} 
                   placeholder="https://github.com/user/repo" 
                   required 
                />
              </div>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ alignSelf: "flex-end", padding: "0.6rem 1rem" }}
                onClick={fetchBranches}
                disabled={fetchingBranches || !repoUrl}
              >
                {fetchingBranches ? "..." : "Fetch"}
              </button>
            </div>

            {branches.length > 0 && (
              <div>
                <label className="label">Select Branch</label>
                <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                  {branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}

            {showTree && (
              <div style={{ marginTop: "0.5rem" }}>
                <label className="label">Pick Model Root (folder containing DOCKERFILE)</label>
                <GitHubRepoTree repoUrl={repoUrl} branch={branch} onSelectPath={(p) => setModelRoot(p)} />
                {modelRoot !== null && (
                  <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "rgba(108,71,255,0.1)", borderRadius: "8px", border: "1px solid var(--accent)", fontSize: "0.85rem" }}>
                    Selected root: <strong>{modelRoot === "" ? "(repository root)" : modelRoot}</strong>
                  </div>
                )}
              </div>
            )}

            {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>⚠ {error}</div>}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button type="submit" className="btn btn-primary" disabled={loading || !repoUrl || modelRoot === null}>
                {loading ? "Queuing Build..." : "🔨 Build & Register"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
