import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }],
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, trim: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    redirectUrl: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

notificationSchema.index({ recipients: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
