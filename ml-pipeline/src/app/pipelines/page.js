// src/app/pipelines/page.js
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import Pipeline from "@/models/Pipeline";
import MLModel from "@/models/Model";
import User from "@/models/User";
import Sidebar from "@/components/Sidebar";
import PipelinesClient from "./PipelinesClient";

export default async function PipelinesPage() {
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
  const [user, pipelines, models] = await Promise.all([
    User.findById(session.userId).lean(),
    Pipeline.find({ ownerId: session.userId }).sort({ createdAt: -1 }).lean(),
    MLModel.find({ ownerId: session.userId }).lean(),
  ]);

  const serializePipeline = (p) => ({
    ...p,
    _id: p._id.toString(),
    ownerId: p.ownerId.toString(),
    nodes: p.nodes.map((n) => ({ ...n, modelId: n.modelId.toString() })),
    createdAt: p.createdAt?.toISOString?.() ?? null,
  });

  const serializeModel = (m) => ({
    ...m,
    _id: m._id.toString(),
    ownerId: m.ownerId.toString(),
    createdAt: m.createdAt?.toISOString?.() ?? null,
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} />
      <PipelinesClient
        pipelines={pipelines.map(serializePipeline)}
        models={models.map(serializeModel)}
      />
    </div>
  );
}
