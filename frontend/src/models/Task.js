import mongoose from "mongoose";

const { Schema } = mongoose;

const TaskSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pipelineId: {
      type: Schema.Types.ObjectId,
      ref: "Pipeline",
      required: true,
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