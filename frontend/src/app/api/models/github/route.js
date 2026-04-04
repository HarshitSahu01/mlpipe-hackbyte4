// src/app/api/models/github/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import MLModel from "@/models/Model";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

export async function POST(req) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const body = await req.json();
    const { name, description, dockerImage, ioSchema, repoUrl, branch, modelRoot } = body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!name?.trim()) return NextResponse.json({ error: "Model name is required" }, { status: 400 });
    if (!repoUrl?.trim()) return NextResponse.json({ error: "Repo URL is required" }, { status: 400 });

    await connectDB();

    const model = await MLModel.create({
      ownerId: session.userId,
      name: name.trim(),
      description,
      dockerImage,
      ioSchema,
      source: "github",
      repoUrl,
      branch,
      modelRoot,
      status: "building",
    });

    // ── Create a Build Task record ────────────────────────────────────────────
    const TaskModel = (await import("@/models/Task")).default;
    const buildTask = await TaskModel.create({
      userId: session.userId,
      modelId: model._id,
      taskType: "build",
      status: "queued",
    });

    // ── Dispatch to FastAPI ───────────────────────────────────────────────────
    const imageTag = `predict-xplore/${model._id.toString()}:latest`;
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/webhooks/fastapi`;

    const pullPayload = {
      task_id: buildTask._id.toString(),
      model_id: model._id.toString(),
      repo_url: repoUrl,
      branch: branch || "main",
      model_root: modelRoot || "",
      image_tag: imageTag,
      webhook_url: webhookUrl,
    };

    const fastapiRes = await fetch(`${FASTAPI_URL}/github-pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pullPayload),
    }).catch((err) => {
      console.error("FastAPI /github-pull unreachable:", err.message);
      return null;
    });

    if (fastapiRes && fastapiRes.ok) {
      const data = await fastapiRes.json();
      buildTask.celeryTaskId = data.celery_task_id || "";
      buildTask.status = "running";
    } else {
      buildTask.status = "failed";
      model.status = "error";
      await model.save();
    }

    await buildTask.save();
    model.buildTaskId = buildTask._id.toString();
    await model.save();

    return NextResponse.json({ model, buildTaskId: buildTask._id.toString() }, { status: 201 });
  } catch (error) {
    console.error("POST /api/models/github error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
