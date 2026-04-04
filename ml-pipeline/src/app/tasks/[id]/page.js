// src/app/tasks/[id]/page.js
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import User from "@/models/User";
import Sidebar from "@/components/Sidebar";
import TaskLogs from "@/components/TaskLogs";
import Link from "next/link";

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
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
      .lean(),
  ]);

  if (!task) notFound();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} />

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
            <StatusBadge status={task.status} />
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
            { label: "Pipeline", value: task.pipelineId?.name ?? "—" },
            { label: "Celery Task ID", value: task.celeryTaskId || "Pending" },
            { label: "Created", value: task.createdAt ? new Date(task.createdAt).toLocaleString() : "—" },
            { label: "Updated", value: task.updatedAt ? new Date(task.updatedAt).toLocaleString() : "—" },
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
            taskId={task._id.toString()}
            initialStatus={task.status}
          />
        </div>
      </main>
    </div>
  );
}
