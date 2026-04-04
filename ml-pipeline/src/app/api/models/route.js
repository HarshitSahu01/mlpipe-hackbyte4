// src/app/api/models/route.js
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import MLModel from "@/models/Model";

const SHARED_STORAGE = path.join(process.cwd(), "..", "shared_storage");

/**
 * @swagger
 * /api/models:
 *   get:
 *     summary: List all models owned by the authenticated user
 *     tags: [Models]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Array of model objects
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Register a new ML model (with optional file upload)
 *     tags: [Models]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, dockerImage]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               dockerImage:
 *                 type: string
 *               ioSchema:
 *                 type: string
 *                 description: JSON string of {inputs:[],outputs:[]}
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Model registered
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
    const models = await MLModel.find({ ownerId: session.userId }).sort({ createdAt: -1 });
    return NextResponse.json({ models }, { status: 200 });
  } catch (error) {
    console.error("GET /api/models error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const formData = await req.formData();
    const name = formData.get("name");
    const description = formData.get("description") || "";
    const dockerImage = formData.get("dockerImage") || "python:3.10-slim";
    const ioSchemaRaw = formData.get("ioSchema") || '{"inputs":[],"outputs":[]}';
    const file = formData.get("file"); // optional binary upload

    if (!name) {
      return NextResponse.json({ error: "Model name is required" }, { status: 400 });
    }

    let ioSchema;
    try {
      ioSchema = JSON.parse(ioSchemaRaw);
    } catch {
      return NextResponse.json({ error: "ioSchema must be valid JSON" }, { status: 400 });
    }

    await connectDB();

    // Create the DB record first to get an _id
    const model = await MLModel.create({
      ownerId: session.userId,
      name,
      description,
      dockerImage,
      ioSchema,
      localModelPath: "",
      status: "pending",
    });

    // If a file was uploaded, persist it to shared_storage
    if (file && typeof file === "object") {
      const modelDir = path.join(SHARED_STORAGE, "models", model._id.toString());
      await fs.mkdir(modelDir, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = path.join(modelDir, file.name || "model_artifact");
      await fs.writeFile(filePath, buffer);

      // Update the record with the real path and set status to ready
      model.localModelPath = filePath;
      model.status = "ready";
      await model.save();
    }

    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    console.error("POST /api/models error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
