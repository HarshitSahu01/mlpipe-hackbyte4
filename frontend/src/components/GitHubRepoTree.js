// src/components/GitHubRepoTree.js
"use client";
import { useState, useEffect } from "react";

export default function GitHubRepoTree({ repoUrl, branch = "main", onSelectPath }) {
  const [contents, setContents] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const repoPath = repoUrl.replace("https://github.com/", "").replace(/\/+$/, "");

  async function fetchContents(path) {
    setLoading(true);
    setError("");
    try {
      const endpoint = `https://api.github.com/repos/${repoPath}/contents/${path}?ref=${branch}`;
      const res = await fetch(`/api/github/proxy?endpoint=${encodeURIComponent(endpoint)}`);
      
      if (!res.ok) {
         throw new Error("Failed to fetch folder contents.");
      }
      const data = await res.json();
      
      // Ensure data is an array (GitHub returns an object if it's a file)
      if (Array.isArray(data)) {
         setContents(data.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === "dir" ? -1 : 1;
         }));
      } else {
         setContents([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (repoUrl && branch) {
      fetchContents(currentPath);
    }
  }, [repoUrl, branch, currentPath]);

  function handleFolderClick(path) {
    setCurrentPath(path);
  }

  function handleBack() {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  }

  return (
    <div style={{ 
      background: "var(--card-bg)", 
      border: "1px solid var(--border)", 
      borderRadius: "12px", 
      padding: "1rem",
      maxHeight: "400px",
      overflowY: "auto",
      fontSize: "0.85rem"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ fontWeight: 600 }}>
          Repository Explorer {currentPath && <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}>/ {currentPath}</span>}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
           {currentPath && (
             <button type="button" className="btn btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }} onClick={handleBack}>
               ↑ Back
             </button>
           )}
           <button 
             type="button" 
             className="btn btn-primary" 
             style={{ padding: "0.2rem 0.75rem", fontSize: "0.75rem" }}
             onClick={() => onSelectPath(currentPath)}
           >
             Set "{currentPath || "(root)"}" as Model Root
           </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-muted)" }}>Loading folder structure...</div>
      ) : error ? (
        <div style={{ color: "var(--danger)", padding: "1rem" }}>⚠ {error}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {contents.map((item) => (
            <div 
              key={item.sha} 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                padding: "0.5rem", 
                borderRadius: "6px", 
                cursor: item.type === "dir" ? "pointer" : "default",
                background: "var(--bg-hover-soft)",
                transition: "all 0.2s"
              }}
              onClick={() => item.type === "dir" && handleFolderClick(item.path)}
              className={item.type === "dir" ? "hover-item" : ""}
            >
              <span style={{ marginRight: "0.75rem", fontSize: "1.1rem" }}>
                {item.type === "dir" ? "📁" : "📄"}
              </span>
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.name}
              </span>
              {item.type === "dir" && <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>→</span>}
            </div>
          ))}
          {contents.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              Folder is empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}
