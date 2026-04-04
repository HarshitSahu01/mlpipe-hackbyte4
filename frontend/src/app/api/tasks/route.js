// src/app/api/tasks/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import Task from "@/models/Task";
import Pipeline from "@/models/Pipeline";
import MLModel from "@/models/Model";
import path from "path";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
const SHARED_STORAGE = path.join(process.cwd(), "..", "shared_storage");

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: List all tasks for the authenticated user
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Array of task objects
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Trigger a new inference task for a pipeline
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pipelineId]
 *             properties:
 *               pipelineId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task queued
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

export async function GET(req) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const tasks = await Task.find({ userId: session.userId })
      .populate("pipelineId", "name")
      .populate("modelId", "name status")
      .sort({ createdAt: -1 });
    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { pipelineId } = await req.json();
    if (!pipelineId) {
      return NextResponse.json({ error: "pipelineId is required" }, { status: 400 });
    }

    await connectDB();

    // Load pipeline and verify ownership
    const pipeline = await Pipeline.findOne({
      _id: pipelineId,
      ownerId: session.userId,
    }).populate("nodes.modelId");

    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    if (pipeline.nodes.length === 0) {
      return NextResponse.json({ error: "Pipeline has no nodes" }, { status: 400 });
    }

    // Create the Task document in Mongo (status = queued)
    const task = await Task.create({
      userId: session.userId,
      pipelineId: pipeline._id,
      status: "queued",
    });

    // Build the TriggerPayload for FastAPI
    const nodes = pipeline.nodes
      .sort((a, b) => a.order - b.order)
      .map((node, idx) => {
        const model = node.modelId;
        const taskDir = path.join(SHARED_STORAGE, "outputs", task._id.toString());
        return {
          model_id: model._id.toString(),
          docker_image: model.dockerImage,
          model_path: model.localModelPath,
          input_path: path.join(SHARED_STORAGE, "inputs", task._id.toString(), `node_${idx}_input.json`),
          output_path: path.join(taskDir, `node_${idx}_output.json`),
        };
      });

    const triggerPayload = {
      task_id: task._id.toString(),
      pipeline_id: pipeline._id.toString(),
      user_id: session.userId,
      nodes,
      webhook_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/webhooks/fastapi`,
    };

    // Fire-and-forget: dispatch to FastAPI
    const fastapiRes = await fetch(`${FASTAPI_URL}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(triggerPayload),
    }).catch((err) => {
      console.error("FastAPI unreachable:", err.message);
      return null;
    });

    let celeryTaskId = "";
    if (fastapiRes && fastapiRes.ok) {
      const data = await fastapiRes.json();
      celeryTaskId = data.celery_task_id || "";
      task.celeryTaskId = celeryTaskId;
      task.status = "running";
    } else {
      // FastAPI unavailable or returned an error — mark task as failed immediately
      // so the user sees an actionable state instead of an eternal "queued" status.
      console.warn("FastAPI did not accept the trigger — marking task as failed.");
      task.status = "failed";
    }

    await task.save();

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
