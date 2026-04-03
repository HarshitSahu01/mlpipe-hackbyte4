import mongoose from "mongoose";

const { Schema } = mongoose;

const PipelineNodeSchema = new Schema(
  {
    modelId: {
      type: Schema.Types.ObjectId,
      ref: "MLModel",
      required: true,
    },
    order: {
      type: Number,
      required: true,
    },
    inputMappings: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { _id: false }
);

const PipelineSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    nodes: {
      type: [PipelineNodeSchema],
      default: [],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export default mongoose.models.Pipeline ||
  mongoose.model("Pipeline", PipelineSchema);