// src/app/dashboard/page.js
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import MLModel from "@/models/Model";
import Pipeline from "@/models/Pipeline";
import Task from "@/models/Task";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";

function StatCard({ label, value, icon, color }) {
  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "10px",
          background: `${color}1a`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.2rem",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "1.75rem", fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: "4px" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) redirect("/auth/login");

  let session;
  try {
    session = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    redirect("/auth/login");
  }

  await connectDB();
  const [user, totalModels, totalPipelines, totalTasks, recentTasks] = await Promise.all([
    User.findById(session.userId).lean(),
    MLModel.countDocuments({ ownerId: session.userId }),
    Pipeline.countDocuments({ ownerId: session.userId }),
    Task.countDocuments({ userId: session.userId }),
    Task.find({ userId: session.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("pipelineId", "name")
      .lean(),
  ]);

  // Serialize: ObjectId and Date are not plain objects — RSC will throw otherwise
  const serializedUser = user
    ? {
        _id: user._id.toString(),
        name: user.name ?? "",
        email: user.email ?? "",
        role: user.role ?? "",
        credits: user.credits ?? 0,
      }
    : null;

  const serializedTasks = recentTasks.map((t) => ({
    _id: t._id.toString(),
    status: t.status,
    createdAt: t.createdAt?.toISOString?.() ?? null,
    pipelineId: t.pipelineId
      ? { _id: t.pipelineId._id.toString(), name: t.pipelineId.name }
      : null,
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={serializedUser} />

      <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Welcome back, {serializedUser?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
            Here's what's happening across your ML pipelines.
          </p>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <StatCard label="Models registered" value={totalModels} icon="◈" color="#6c47ff" />
          <StatCard label="Pipelines" value={totalPipelines} icon="⟳" color="#22c55e" />
          <StatCard label="Tasks run" value={totalTasks} icon="⚡" color="#f59e0b" />
          <StatCard label="Credits" value={serializedUser?.credits ?? 0} icon="◎" color="#8b6dff" />
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "2rem", flexWrap: "wrap" }}>
          <Link href="/models?new=1" className="btn btn-primary">+ Register Model</Link>
          <Link href="/pipelines?new=1" className="btn btn-secondary">+ New Pipeline</Link>
          <Link href="/tasks?new=1" className="btn btn-secondary">⚡ Run Task</Link>
        </div>

        {/* Recent tasks */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "1rem 1.5rem",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Recent Tasks</h2>
            <Link href="/tasks" style={{ fontSize: "0.8rem", color: "var(--accent-light)" }}>
              View all →
            </Link>
          </div>

          {serializedTasks.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              No tasks yet.{" "}
              <Link href="/tasks?new=1" style={{ color: "var(--accent-light)" }}>
                Run your first pipeline →
              </Link>
            </div>
          ) : (
            <div className="table-container" style={{ borderRadius: 0, border: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>Task ID</th>
                    <th>Pipeline</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {serializedTasks.map((task) => (
                    <tr key={task._id}>
                      <td>
                        <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {task._id.slice(-8)}
                        </code>
                      </td>
                      <td>{task.pipelineId?.name ?? "—"}</td>
                      <td>
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="text-muted" style={{ fontSize: "0.8rem" }}>
                        {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                      </td>
                      <td>
                        <Link
                          href={`/tasks/${task._id}`}
                          style={{ fontSize: "0.8rem", color: "var(--accent-light)" }}
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
