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
      enum: ["pending", "ready", "error"],
      default: "pending",
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

export default mongoose.models.MLModel || mongoose.model("MLModel", ModelSchema);