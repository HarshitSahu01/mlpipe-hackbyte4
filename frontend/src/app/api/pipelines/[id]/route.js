// src/app/api/pipelines/[id]/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import Pipeline from "@/models/Pipeline";
import Task from "@/models/Task";

/**
 * @swagger
 * /api/pipelines/{id}:
 *   delete:
 *     summary: Delete a pipeline and its associated task records
 *     tags: [Pipelines]
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
 *         description: Pipeline deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Pipeline not found
 *       500:
 *         description: Internal server error
 */
export async function DELETE(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { id } = await params;
    await connectDB();

    const pipeline = await Pipeline.findOne({ _id: id, ownerId: session.userId });
    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    // 1. Delete associated Task records (inference history)
    await Task.deleteMany({ pipelineId: id });

    // 2. Delete the Pipeline record
    await Pipeline.deleteOne({ _id: id });

    return NextResponse.json({ ok: true, message: "Pipeline deleted." }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/pipelines/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
