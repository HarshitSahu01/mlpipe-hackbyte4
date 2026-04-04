// src/components/CancelTaskButton.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelTaskButton({ taskId, initialStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const isCancellable = status === "queued" || status === "running";

  async function handleCancel() {
    if (!confirm("Are you sure you want to stop this task? It will terminate immediately.")) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      if (res.ok) {
        setStatus("failed");
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to cancel task");
      }
    } catch {
      alert("Network error");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isCancellable) return null;

  return (
    <button
      onClick={handleCancel}
      disabled={isLoading}
      className="btn btn-danger"
      style={{
        padding: "0.35rem 0.75rem",
        fontSize: "0.75rem",
        marginLeft: "0.5rem"
      }}
    >
      {isLoading ? "Stopping…" : "✋ Stop Task"}
    </button>
  );
}
