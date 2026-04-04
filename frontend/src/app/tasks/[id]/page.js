// src/app/tasks/[id]/page.js
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import User from "@/models/User";
import Sidebar from "@/components/Sidebar";
import TaskLogs from "@/components/TaskLogs";
import CancelTaskButton from "@/components/CancelTaskButton";
import Link from "next/link";

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function TypeBadge({ taskType }) {
  const isBuild = taskType === "build";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "0.72rem",
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: "99px",
      background: isBuild ? "rgba(139,92,246,0.15)" : "rgba(59,130,246,0.15)",
      color: isBuild ? "#a78bfa" : "#60a5fa",
      border: `1px solid ${isBuild ? "rgba(139,92,246,0.3)" : "rgba(59,130,246,0.3)"}`,
    }}>
      {isBuild ? "🔨 build" : "⚡ inference"}
    </span>
  );
}

function serializeTask(task) {
  if (!task) return null;
  // Deep clone and convert all ObjectIds/Dates into plain JSON strings
  return JSON.parse(JSON.stringify(task));
}


export default async function TaskDetailPage({ params }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) redirect("/auth/login");

  let session;
  try {
    session = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    redirect("/auth/login");
  }

  const { id } = await params;
  await connectDB();

  const [user, task] = await Promise.all([
    User.findById(session.userId).lean(),
    Task.findOne({ _id: id, userId: session.userId })
      .populate("pipelineId", "name nodes")
      .populate("modelId", "name dockerImage")
      .lean(),
  ]);

  if (!task) notFound();

  // Serialize — ObjectId and Date are not plain RSC-safe objects
  const serializedUser = user ? JSON.parse(JSON.stringify(user)) : null;
  const serializedTask = serializeTask(task);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={serializedUser} />

      <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
        {/* Back + header */}
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/tasks" style={{ fontSize: "0.85rem", color: "var(--text-muted)", textDecoration: "none" }}>
            ← Back to Tasks
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.75rem" }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>
              Task{" "}
              <code style={{ fontSize: "1rem", color: "var(--text-muted)" }}>
                {task._id.toString().slice(-12)}
              </code>
            </h1>
            <TypeBadge taskType={serializedTask.taskType} />
            <StatusBadge status={serializedTask.status} />
            <CancelTaskButton
              taskId={serializedTask._id}
              initialStatus={serializedTask.status}
            />
            {serializedTask.status === "completed" && serializedTask.taskType === "inference" && (
              <a
                href={`/api/tasks/${serializedTask._id}/result`}
                download
                className="btn btn-primary"
                style={{
                  padding: "0.4rem 1rem",
                  fontSize: "0.82rem",
                  textDecoration: "none",
                  display: "inline-block",
                  fontWeight: 600,
                  marginLeft: "0.5rem"
                }}
              >
                 Download Result
              </a>
            )}
          </div>
        </div>

        {/* Meta */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          {[
            { label: serializedTask.taskType === "build" ? "Model Build" : "Pipeline", value: serializedTask.taskType === "build" ? serializedTask.modelId?.name ?? "—" : serializedTask.pipelineId?.name ?? "—" },
            { label: "Celery Task ID", value: serializedTask.celeryTaskId || "Pending" },

            { label: "Created", value: serializedTask.createdAt ? new Date(serializedTask.createdAt).toLocaleString() : "—" },
            { label: "Updated", value: serializedTask.updatedAt ? new Date(serializedTask.updatedAt).toLocaleString() : "—" },
          ].map((item) => (
            <div key={item.label} className="card" style={{ padding: "1rem" }}>
              <div className="label">{item.label}</div>
              <div style={{ fontWeight: 500, fontSize: "0.88rem", wordBreak: "break-all" }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Live logs + status */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Live Output</h2>
          <TaskLogs
            taskId={serializedTask._id}
            initialStatus={serializedTask.status}
          />
        </div>
      </main>
    </div>
  );
}
