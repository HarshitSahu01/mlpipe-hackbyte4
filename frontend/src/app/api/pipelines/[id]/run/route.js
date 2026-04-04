// src/app/api/pipelines/[id]/run/route.js
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { connectDB } from "@/lib/mongoose";
import { requireAuth } from "@/lib/auth";
import Pipeline from "@/models/Pipeline";
import MLModel from "@/models/Model";
import Task from "@/models/Task";

const SHARED_STORAGE = path.join(process.cwd(), "..", "shared_storage");
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

export async function POST(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { id: pipelineId } = await params;
    const formData = await req.formData();
    const file = formData.get("file");
    const isZip = formData.get("isZip") === "true";

    if (!file) {
      return NextResponse.json(
        { error: "Missing input file." },
        { status: 400 },
      );
    }

    await connectDB();

    // 1. Fetch Pipeline data
    const pipeline = await Pipeline.findOne({
      _id: pipelineId,
      ownerId: session.userId,
    });
    if (!pipeline || pipeline.nodes.length === 0) {
      return NextResponse.json(
        { error: "Pipeline not found or empty." },
        { status: 404 },
      );
    }

    // 2. Fetch all models in the pipeline
    const modelIds = pipeline.nodes.map((n) => n.modelId);
    const models = await MLModel.find({ _id: { $in: modelIds } });
    const modelsMap = new Map(models.map((m) => [m._id.toString(), m]));

    // 3. Create Task record
    const task = await Task.create({
      userId: session.userId,
      pipelineId: pipeline._id,
      taskType: "inference",
      status: "queued",
    });

    const taskId = task._id.toString();

    // 4. Save uploaded file to shared_storage
    const uploadDir = path.join(SHARED_STORAGE, "uploads", taskId);
    await fs.mkdir(uploadDir, { recursive: true });

    // We'll save it as 'input_package' regardless of ZIP/file,
    // the worker will handle extraction if it ends in .zip
    const fileName = file.name || (isZip ? "input.zip" : "input.file");
    const inputPath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    // 5. Construct TriggerPayload for DAG execution
    const nodes = [];

    for (let i = 0; i < pipeline.nodes.length; i++) {
      const nodeDef = pipeline.nodes[i];
      const model = modelsMap.get(nodeDef.modelId.toString());

      // Provide backwards compatibility for older sequential pipelines
      const nodeId = nodeDef.id || `node_${i}`;
      const dependsOn = nodeDef.dependsOn || (i > 0 && !nodeDef.id ? [`node_${i - 1}`] : []);
      const nextNodes = nodeDef.nextNodes || (i < pipeline.nodes.length - 1 && !nodeDef.id ? [`node_${i + 1}`] : []);

      const isRoot = dependsOn.length === 0;

      // Root nodes read from uploadDir. Dependent nodes will have their inputs staged by the worker.
      const inputPath = isRoot
        ? uploadDir
        : path.join(SHARED_STORAGE, "runs", taskId, `${nodeId}_inputs`);

      // Each node outputs to a dedicated folder.
      const outputPath = path.join(
        SHARED_STORAGE,
        "outputs",
        taskId,
        `${nodeId}_output`
      );

      nodes.push({
        id: nodeId,
        model_id: model._id.toString(),
        docker_image: model.builtImage || model.dockerImage,
        model_path: model.localModelPath || "",
        input_path: inputPath,
        output_path: outputPath,
        depends_on: dependsOn,
        next_nodes: nextNodes,
      });
    }

    const payload = {
      task_id: taskId,
      pipeline_id: pipelineId,
      user_id: session.userId,
      nodes: nodes,
      webhook_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/webhooks/fastapi`,
    };

    // 6. Call FastAPI trigger endpoint
    const fastapiRes = await fetch(`${FASTAPI_URL}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error("FastAPI /trigger error:", err.message);
      return null;
    });

    if (fastapiRes && fastapiRes.ok) {
      const data = await fastapiRes.json();
      task.celeryTaskId = data.celery_task_id;
      task.status = "running";
      await task.save();
      return NextResponse.json({ ok: true, taskId }, { status: 200 });
    } else {
      task.status = "failed";
      task.errorMessage = "Failed to dispatch task to compute gateway.";
      await task.save();
      return NextResponse.json({ error: task.errorMessage }, { status: 500 });
    }
  } catch (error) {
    console.error("POST /api/pipelines/[id]/run error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
