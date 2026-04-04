// src/app/api/webhooks/fastapi/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import MLModel from "@/models/Model";

/**
 * @swagger
 * /api/webhooks/fastapi:
 *   post:
 *     summary: Celery worker callback — update task status (inference or build)
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [task_id, status]
 *             properties:
 *               task_id:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [running, completed, failed]
 *               task_type:
 *                 type: string
 *                 enum: [inference, build]
 *               model_id:
 *                 type: string
 *               docker_image:
 *                 type: string
 *               results_path:
 *                 type: string
 *               logs_path:
 *                 type: string
 *               error:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task updated
 *       400:
 *         description: Missing fields
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */
export async function POST(req) {
  try {
    const rawText = await req.text();
    console.log("[webhook] Raw body received:", rawText);
    let body;
    try {
      body = JSON.parse(rawText);
    } catch (err) {
      console.error("[webhook] JSON Parse Error:", err.message, "Raw:", rawText);
      return NextResponse.json({ error: "Invalid JSON", details: err.message }, { status: 400 });
    }
    const {
      task_id,
      status,
      task_type,
      model_id,
      docker_image,
      results_path,
      logs_path,
      error: workerError,
    } = body;

    if (!task_id || !status) {
      return NextResponse.json(
        { error: "task_id and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["running", "completed", "failed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    await connectDB();

    // ── Update the Task document ──────────────────────────────────────────────
    const taskUpdate = { status };
    if (results_path) taskUpdate.resultsPath = results_path;
    if (logs_path) taskUpdate.localLogsPath = logs_path;
    if (workerError !== undefined) taskUpdate.errorMessage = workerError;
    if (docker_image) taskUpdate.buildImage = docker_image;

    const task = await Task.findByIdAndUpdate(task_id, taskUpdate, { new: true });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // ── For build tasks: also update the MLModel record ───────────────────────
    if (task_type === "build" && model_id) {
      const modelUpdate = {};
      if (status === "completed") {
        modelUpdate.status = "ready";
        if (docker_image) modelUpdate.builtImage = docker_image;
      } else if (status === "failed") {
        modelUpdate.status = "error";
      }
      if (Object.keys(modelUpdate).length > 0) {
        await MLModel.findByIdAndUpdate(model_id, modelUpdate);
      }
    }

    console.log(`[webhook] Task ${task_id} (${task_type || "inference"}) → ${status}`);
    return NextResponse.json({ ok: true, task }, { status: 200 });
  } catch (error) {
    console.error("POST /api/webhooks/fastapi error:", error);
    if (error.name === 'ValidationError') {
      console.error("Validation Details:", error.errors);
    }
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
}
