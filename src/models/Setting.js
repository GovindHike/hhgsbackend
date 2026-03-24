import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    primaryColor: {
      type: String,
      default: "#2563eb",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

export const Setting = mongoose.model("Setting", settingSchema);
