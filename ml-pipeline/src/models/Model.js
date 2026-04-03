import mongoose from "mongoose";

const { Schema } = mongoose;

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
      required: true,
    },
    ioSchema: {
      inputs: {
        type: [IOFieldSchema],
        default: [],
      },
      outputs: {
        type: [IOFieldSchema],
        default: [],
      },
    },
    dockerImage: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export default mongoose.models.MLModel || mongoose.model("MLModel", ModelSchema);