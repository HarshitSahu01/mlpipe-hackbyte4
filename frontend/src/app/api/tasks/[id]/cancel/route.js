// src/app/api/tasks/[id]/cancel/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import Task from "@/models/Task";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

export async function POST(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { id } = await params;
    await connectDB();

    const task = await Task.findOne({ _id: id, userId: session.userId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status === "completed" || task.status === "failed") {
      return NextResponse.json({ error: "Task already finished" }, { status: 400 });
    }

    // 1. If we have a celeryTaskId, tell FastAPI to revoke it
    if (task.celeryTaskId) {
      try {
        await fetch(`${FASTAPI_URL}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ celery_task_id: task.celeryTaskId }),
        });
      } catch (err) {
        console.error("Failed to cancel on FastAPI:", err.message);
        // We continue anyway to mark it as failed in our DB
      }
    }

    // 2. Mark the local task as failed
    task.status = "failed";
    task.errorMessage = "Cancelled by user";
    await task.save();

    return NextResponse.json({ success: true, status: "failed" }, { status: 200 });
  } catch (error) {
    console.error("POST /api/tasks/[id]/cancel error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
