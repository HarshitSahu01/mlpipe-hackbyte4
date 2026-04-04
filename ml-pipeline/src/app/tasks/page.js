// src/app/tasks/page.js
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import Pipeline from "@/models/Pipeline";
import User from "@/models/User";
import Sidebar from "@/components/Sidebar";
import TasksClient from "./TasksClient";

export default async function TasksPage({ searchParams }) {
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
  const [user, tasks, pipelines] = await Promise.all([
    User.findById(session.userId).lean(),
    Task.find({ userId: session.userId })
      .populate("pipelineId", "name")
      .sort({ createdAt: -1 })
      .lean(),
    Pipeline.find({ ownerId: session.userId }).lean(),
  ]);

  const serialize = (t) => ({
    ...t,
    _id: t._id.toString(),
    userId: t.userId.toString(),
    pipelineId: t.pipelineId
      ? { ...t.pipelineId, _id: t.pipelineId._id.toString() }
      : null,
    createdAt: t.createdAt?.toISOString?.() ?? null,
    updatedAt: t.updatedAt?.toISOString?.() ?? null,
  });

  const serializePipeline = (p) => ({
    _id: p._id.toString(),
    name: p.name,
  });

  const { pipeline: preselectedPipelineId } = await searchParams;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} />
      <TasksClient
        tasks={tasks.map(serialize)}
        pipelines={pipelines.map(serializePipeline)}
        preselectedPipelineId={preselectedPipelineId ?? ""}
      />
    </div>
  );
}
