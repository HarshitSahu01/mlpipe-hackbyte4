// src/app/api/pipelines/route.js
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import Pipeline from "@/models/Pipeline";

/**
 * @swagger
 * /api/pipelines:
 *   get:
 *     summary: List all pipelines owned by the authenticated user
 *     tags: [Pipelines]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Array of pipeline objects
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a new inference pipeline
 *     tags: [Pipelines]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, nodes]
 *             properties:
 *               name:
 *                 type: string
 *               nodes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     modelId:
 *                       type: string
 *                     order:
 *                       type: number
 *                     inputMappings:
 *                       type: object
 *     responses:
 *       201:
 *         description: Pipeline created
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
    const pipelines = await Pipeline.find({ ownerId: session.userId })
      .populate("nodes.modelId", "name dockerImage ioSchema status")
      .sort({ createdAt: -1 });
    return NextResponse.json({ pipelines }, { status: 200 });
  } catch (error) {
    console.error("GET /api/pipelines error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { name, nodes } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Pipeline name is required" }, { status: 400 });
    }
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return NextResponse.json({ error: "Pipeline must have at least one node" }, { status: 400 });
    }

    // Validate nodes structure
    for (const node of nodes) {
      if (!node.modelId) {
        return NextResponse.json({ error: "Each node must have a modelId" }, { status: 400 });
      }
    }

    // Ensure order is assigned (use array index if not provided)
    const normalizedNodes = nodes.map((n, i) => ({
      modelId: n.modelId,
      order: n.order ?? i,
      inputMappings: n.inputMappings ?? {},
    }));

    await connectDB();
    const pipeline = await Pipeline.create({
      name: name.trim(),
      ownerId: session.userId,
      nodes: normalizedNodes,
    });

    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (error) {
    console.error("POST /api/pipelines error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
