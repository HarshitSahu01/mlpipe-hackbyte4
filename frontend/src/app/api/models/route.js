// src/app/api/models/route.js
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import MLModel from "@/models/Model";

const SHARED_STORAGE = path.join(process.cwd(), "..", "shared_storage");

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
    if (!fileName.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "Uploaded file must be a .zip archive." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

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
    const missing = REQUIRED_ZIP_FILES.filter(
      (req) => !entries.some((e) => e === req || e.endsWith("/" + req))
    );

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `ZIP package is missing required file(s): ${missing.join(", ")}. ` +
                 `The ZIP must contain run.py (reads $INPUT_PATH, writes $OUTPUT_PATH), ` +
                 `requirements.txt, and a DOCKERFILE.`,
        },
        { status: 400 }
      );
    }

    // ── Persist ──────────────────────────────────────────────────────────────
    await connectDB();

    const model = await MLModel.create({
      ownerId: session.userId,
      name: name.trim(),
      description,
      dockerImage,
      ioSchema,
      localModelPath: "",
      status: "pending",
    });

    const modelDir  = path.join(SHARED_STORAGE, "models", model._id.toString());
    await fs.mkdir(modelDir, { recursive: true });
    const filePath  = path.join(modelDir, fileName);
    await fs.writeFile(filePath, buffer);

    model.localModelPath = filePath;
    model.status = "ready";
    await model.save();

    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    console.error("POST /api/models error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
