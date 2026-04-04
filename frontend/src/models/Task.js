import mongoose from "mongoose";

const { Schema } = mongoose;

const TaskSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // For inference tasks
    pipelineId: {
      type: Schema.Types.ObjectId,
      ref: "Pipeline",
      required: false,
      default: null,
    },
    // For build tasks
    modelId: {
      type: Schema.Types.ObjectId,
      ref: "MLModel",
      required: false,
      default: null,
    },
    taskType: {
      type: String,
      enum: ["inference", "build"],
      default: "inference",
    },
    // The Docker image tag produced by a build task
    buildImage: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    celeryTaskId: {
      type: String,
      default: "",
    },
    localLogsPath: {
      type: String,
      default: "",
    },
    resultsPath: {
      type: String,
      default: "",
    },
    errorMessage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Task ||
  mongoose.model("Task", TaskSchema);