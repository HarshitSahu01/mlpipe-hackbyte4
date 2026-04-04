// src/app/api/models/[id]/route.js
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import MLModel from "@/models/Model";
import Task from "@/models/Task";

const SHARED_STORAGE = path.join(process.cwd(), "..", "shared_storage");
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

/**
 * @swagger
 * /api/models/{id}:
 *   delete:
 *     summary: Delete an ML model, its build logs, its ZIP archive, and its Docker image
 *     tags: [Models]
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
 *         description: Model deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Model not found
 *       500:
 *         description: Internal server error
 */
export async function DELETE(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { id } = await params;
    await connectDB();

    const model = await MLModel.findOne({ _id: id, ownerId: session.userId });
    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // 1. Delete Docker Image (if built)
    if (model.builtImage) {
      try {
        await fetch(`${FASTAPI_URL}/build/${encodeURIComponent(model.builtImage)}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error(`[delete] Failed to delete image ${model.builtImage}:`, err.message);
      }
    }

    // 2. Delete ZIP archive from shared storage
    if (model.localModelPath) {
      try {
        const modelDir = path.dirname(model.localModelPath);
        await fs.rm(modelDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`[delete] Failed to delete model directory:`, err.message);
      }
    }

    // 3. Delete any associated task logs
    const buildTaskId = model.buildTaskId;
    if (buildTaskId) {
      const logDir = path.join(SHARED_STORAGE, "build_logs", buildTaskId);
      await fs.rm(logDir, { recursive: true, force: true }).catch(() => {});
    }

    // 4. Delete DB record
    await MLModel.deleteOne({ _id: id });
    
    // Also delete associated build task records? 
    // We'll keep them for history unless explicitly requested otherwise, 
    // but usually it's cleaner to remove them.
    await Task.deleteMany({ modelId: id });

    return NextResponse.json({ ok: true, message: "Model and associated resources deleted." }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/models/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
