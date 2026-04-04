// src/app/pipelines/[id]/run/page.js
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import Pipeline from "@/models/Pipeline";
import MLModel from "@/models/Model";
import Sidebar from "@/components/Sidebar";
import RunPipelineClient from "./RunPipelineClient";

export default async function RunPipelinePage({ params }) {
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

  const pipeline = await Pipeline.findOne({ _id: id, ownerId: session.userId }).lean();
  if (!pipeline) notFound();

  // Fetch all models in the pipeline to show their names
  const modelIds = pipeline.nodes.map(n => n.modelId);
  const models = await MLModel.find({ _id: { $in: modelIds } }).lean();

  const serializePipeline = (p) => ({
    ...p,
    _id: p._id.toString(),
    ownerId: p.ownerId.toString(),
    nodes: p.nodes.map((n) => ({ ...n, modelId: n.modelId.toString() })),
  });

  const serializeModel = (m) => ({
    ...m,
    _id: m._id.toString(),
    ownerId: m.ownerId?.toString() ?? "",
    createdAt: m.createdAt?.toISOString() ?? null,
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <RunPipelineClient 
            pipeline={serializePipeline(pipeline)} 
            models={models.map(serializeModel)} 
          />
        </div>
      </main>
    </div>
  );
}
