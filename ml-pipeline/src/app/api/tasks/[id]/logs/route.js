// src/app/api/tasks/[id]/logs/route.js
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";

/**
 * @swagger
 * /api/tasks/{id}/logs:
 *   get:
 *     summary: Get the log file content for a task
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plain text log content
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task or logs not found
 *       500:
 *         description: Internal server error
 */
export async function GET(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { id } = await params;
    await connectDB();

    const task = await Task.findOne({ _id: id, userId: session.userId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (!task.localLogsPath) {
      return NextResponse.json({ logs: "No logs yet." }, { status: 200 });
    }

    const logContent = await fs.readFile(task.localLogsPath, "utf-8").catch(() => null);

    if (logContent === null) {
      return NextResponse.json({ logs: "Log file not found on disk." }, { status: 200 });
    }

    return new Response(logContent, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("GET /api/tasks/[id]/logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
