// src/app/api/models/route.js
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import MLModel from "@/models/Model";

const SHARED_STORAGE = path.join(process.cwd(), "..", "shared_storage");
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

// Files that MUST exist at the root (or inside one top-level folder) of the uploaded ZIP
const REQUIRED_ZIP_FILES = ["run.py", "requirements.txt", "DOCKERFILE"];

/**
 * Extract all file entry names from a ZIP buffer by scanning local file headers.
 * Signature: 0x504B0304
 */
function listZipEntries(buf) {
  const names = [];
  let offset = 0;
  while (offset + 30 < buf.length) {
    if (buf[offset] === 0x50 && buf[offset + 1] === 0x4b &&
        buf[offset + 2] === 0x03 && buf[offset + 3] === 0x04) {
      const fnLen  = buf.readUInt16LE(offset + 26);
      const exLen  = buf.readUInt16LE(offset + 28);
      const cSize  = buf.readUInt32LE(offset + 18);
      const name   = buf.slice(offset + 30, offset + 30 + fnLen).toString("utf8");
      names.push(name);
      offset += 30 + fnLen + exLen + cSize;
    } else {
      offset++;
    }
  }
  return names;
}

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
 *     summary: Register a new ML model (ZIP package required)
 *     tags: [Models]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, dockerImage, file]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               dockerImage:
 *                 type: string
 *                 enum: [python:3.10-slim, python:3.11-slim, python:3.12-slim]
 *               ioSchema:
 *                 type: string
 *                 description: JSON string of {inputs:[],outputs:[]}
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: >
 *                   ZIP archive containing run.py, requirements.txt, DOCKERFILE,
 *                   and any model weights. run.py must read $INPUT_PATH and write
 *                   $OUTPUT_PATH in the JSON format the Celery worker expects.
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

const ALLOWED_DOCKER_IMAGES = new Set([
  "python:3.10-slim",
  "python:3.11-slim",
  "python:3.12-slim",
]);

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
    const name        = formData.get("name");
    const description = formData.get("description") || "";
    const dockerImage = formData.get("dockerImage") || "python:3.10-slim";
    const ioSchemaRaw = formData.get("ioSchema") || '{"inputs":[],"outputs":[]}';
    const useAiPackager = formData.get("useAiPackager") === "true";
    const file        = formData.get("file");

    // ── Basic field validation ────────────────────────────────────────────────
    if (!name?.trim()) {
      return NextResponse.json({ error: "Model name is required" }, { status: 400 });
    }

    if (!ALLOWED_DOCKER_IMAGES.has(dockerImage)) {
      return NextResponse.json(
        { error: `dockerImage must be one of: ${[...ALLOWED_DOCKER_IMAGES].join(", ")}` },
        { status: 400 }
      );
    }

    let ioSchema;
    try {
      ioSchema = JSON.parse(ioSchemaRaw);
    } catch {
      return NextResponse.json({ error: "ioSchema must be valid JSON" }, { status: 400 });
    }

    // ── ZIP file validation ───────────────────────────────────────────────────
    if (!file || typeof file !== "object") {
      return NextResponse.json(
        { error: "A model ZIP package is required (run.py, requirements.txt, DOCKERFILE)." },
        { status: 400 }
      );
    }

    const fileName = file.name ?? "";
    const isPyFile = fileName.toLowerCase().endsWith(".py");
    const isZipFile = fileName.toLowerCase().endsWith(".zip");

    if (!isZipFile && !isPyFile) {
      return NextResponse.json(
        { error: "Uploaded file must be a .zip archive or a .py script." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (!useAiPackager) {
      if (!isZipFile) {
        return NextResponse.json(
          { error: "Uploaded file must be a .zip archive unless using AI Packager." },
          { status: 400 }
        );
      }

      // Check ZIP magic bytes: PK\x03\x04
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b ||
          buffer[2] !== 0x03 || buffer[3] !== 0x04) {
        return NextResponse.json(
          { error: "File does not appear to be a valid ZIP archive." },
          { status: 400 }
        );
      }

      // Enumerate ZIP entries and check for required files
      const entries = listZipEntries(buffer);
      
      // Check for each core requirement
      const hasRunFile = entries.some(e => {
        const base = e.split("/").pop().toLowerCase();
        return base === "run.py" || base === "inference.py";
      });
      const hasRequirements = entries.some(e => e.split("/").pop().toLowerCase() === "requirements.txt");
      const hasDockerfile = entries.some(e => e.split("/").pop().toLowerCase() === "dockerfile");

      const missing = [];
      if (!hasRunFile) missing.push("run.py (or inference.py)");
      if (!hasRequirements) missing.push("requirements.txt");
      if (!hasDockerfile) missing.push("DOCKERFILE");

      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `ZIP package is missing required file(s): ${missing.join(", ")}. ` +
                   `The ZIP must contain run.py or inference.py (entry point), ` +
                   `requirements.txt, and a DOCKERFILE.`,
          },
          { status: 400 }
        );
      }
    }

    // ── Persist model record ──────────────────────────────────────────────────
    await connectDB();

    const model = await MLModel.create({
      ownerId: session.userId,
      name: name.trim(),
      description,
      dockerImage,
      ioSchema,
      localModelPath: "",
      status: "building",
    });

    const modelDir  = path.join(SHARED_STORAGE, "models", model._id.toString());
    await fs.mkdir(modelDir, { recursive: true });
    const filePath  = path.join(modelDir, fileName);
    await fs.writeFile(filePath, buffer);

    model.localModelPath = filePath;
    await model.save();

    // ── Create a Build Task record ────────────────────────────────────────────
    const TaskModel = (await import("@/models/Task")).default;
    const buildTask = await TaskModel.create({
      userId: session.userId,
      modelId: model._id,
      taskType: "build",
      status: "queued",
    });

    // ── Dispatch build to FastAPI / Celery ────────────────────────────────────
    const imageTag = `ml-pipeline/${model._id.toString()}:latest`;
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/webhooks/fastapi`;

    let endpoint = "/build";
    const buildPayload = {
      task_id: buildTask._id.toString(),
      model_id: model._id.toString(),
      image_tag: imageTag,
      webhook_url: webhookUrl,
    };

    if (useAiPackager) {
      endpoint = "/agent-package";
      buildPayload.input_path = filePath;
    } else {
      buildPayload.zip_path = filePath;
    }

    const fastapiRes = await fetch(`${FASTAPI_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload),
    }).catch((err) => {
      console.error("FastAPI /build unreachable:", err.message);
      return null;
    });

    if (fastapiRes && fastapiRes.ok) {
      const data = await fastapiRes.json();
      buildTask.celeryTaskId = data.celery_task_id || "";
      buildTask.status = "running";
    } else {
      buildTask.status = "failed";
      model.status = "error";
      await model.save();
    }

    await buildTask.save();

    model.buildTaskId = buildTask._id.toString();
    await model.save();

    return NextResponse.json({ model, buildTaskId: buildTask._id.toString() }, { status: 201 });
  } catch (error) {
    console.error("POST /api/models error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
