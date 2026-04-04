// src/app/api/webhooks/fastapi/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";

/**
 * @swagger
 * /api/webhooks/fastapi:
 *   post:
 *     summary: Celery worker callback — update task status
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
    const body = await req.json();
    const { task_id, status, results_path, logs_path, error: workerError } = body;

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

    const update = { status };
    if (results_path) update.resultsPath = results_path;
    if (logs_path) update.localLogsPath = logs_path;
    // Always persist the error message (even empty string on success clears stale errors)
    if (workerError !== undefined) update.errorMessage = workerError;

    const task = await Task.findByIdAndUpdate(task_id, update, { new: true });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    console.log(`[webhook] Task ${task_id} → ${status}`);
    return NextResponse.json({ ok: true, task }, { status: 200 });
  } catch (error) {
    console.error("POST /api/webhooks/fastapi error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
