// src/app/api/tasks/[id]/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import Task from "@/models/Task";

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     summary: Get a single task by ID
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
 *         description: Task object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */
export async function GET(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { id } = await params;
    await connectDB();

    const task = await Task.findOne({ _id: id, userId: session.userId }).populate(
      "pipelineId",
      "name nodes"
    );

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task }, { status: 200 });
  } catch (error) {
    console.error("GET /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
