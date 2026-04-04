// src/app/api/tasks/[id]/result/route.js

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";

const SHARED_STORAGE = path.join(process.cwd(), "..", "shared_storage");

const MIME_MAP = {
  ".json": "application/json",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/**
 * @swagger
 * /api/tasks/{id}/result:
 *   get:
 *     summary: Download the final output JSON for an inference task
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
 *         description: Final output JSON file
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task, pipeline, or result file not found
 *       500:
 *         description: Internal server error
 */
export async function GET(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    // ❗ Note: In Next.js 15+ App Router, params must be awaited
    const { id } = await params;
    await connectDB();

    const task = await Task.findOne({
      _id: id,
      userId: session.userId,
    }).populate("pipelineId", "nodes");

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.taskType !== "inference") {
      return NextResponse.json(
        { error: "Only inference tasks have results." },
        { status: 400 }
      );
    }

    if (task.status !== "completed") {
      return NextResponse.json(
        { error: "Task has not completed successfully yet." },
        { status: 400 }
      );
    }

    // ✅ Build candidate paths to try
    const nodes = task.pipelineId?.nodes || [];
    const lastIdx = nodes.length - 1;

    const candidates = [];
    if (task.resultsPath) candidates.push(task.resultsPath);
    if (lastIdx >= 0) {
      const nodePath = path.join(SHARED_STORAGE, "outputs", id, `node_${lastIdx}_output`);
      candidates.push(`${nodePath}.json`);
      candidates.push(nodePath); // Check if it's a directory
    }
    candidates.push(path.join(SHARED_STORAGE, "outputs", id)); // Final fallback

    /**
     * ✅ Robust Helper to resolve a candidate path
     * It handles:
     * 1. Direct file matches (e.g., node_0_output.json)
     * 2. Directory results (e.g., node_0_output.json/some_file_final.json)
     */
    const resolveCandidate = async (candidatePath) => {
      try {
        const stats = await fs.stat(candidatePath);
        if (stats.isFile()) return candidatePath;
        if (stats.isDirectory()) {
          const entries = await fs.readdir(candidatePath);
          const files = entries.filter((e) => !e.endsWith(".txt") && !e.includes("node_")); // ignore logs/subdirs
          if (files.length > 0) {
            // Prefer _final.json, then any json, then anything
            const finalJson = files.find((f) => f.endsWith("_final.json"));
            const anyJson = files.find((f) => f.endsWith(".json"));
            return path.join(candidatePath, finalJson ?? anyJson ?? files[0]);
          }
        }
      } catch (e) {
        // Skip missing or invalid paths
      }
      return null;
    };

    let resolvedPath = null;
    for (const candidate of candidates) {
      resolvedPath = await resolveCandidate(candidate);
      if (resolvedPath) break;
    }

    if (!resolvedPath) {
      return NextResponse.json(
        { error: "Result file not found for this task." },
        { status: 404 }
      );
    }

    const fileBuffer = await fs.readFile(resolvedPath);

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = MIME_MAP[ext] || "application/octet-stream";

    // ✅ Professional filename format
    const fileName = `task_${id.slice(-8)}_result${ext || ".json"}`;

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error("GET /api/tasks/[id]/result error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}