// src/models/Model.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const IOFieldSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true }, // e.g. "string", "number", "file"
    description: { type: String, default: "" },
  },
  { _id: false }
);

const ModelSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "building", "ready", "error"],
      default: "pending",
    },
    buildTaskId: {
      type: String,
      default: "",
    },
    builtImage: {
      type: String,
      default: "",
    },
    localModelPath: {
      type: String,
      default: "",
    },
    ioSchema: {
      inputs: { type: [IOFieldSchema], default: [] },
      outputs: { type: [IOFieldSchema], default: [] },
    },
    dockerImage: {
      type: String,
      default: "python:3.10-slim",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Handling for schema changes in Next.js development
export default mongoose.models.MLModel || mongoose.model("MLModel", ModelSchema);