import mongoose from "mongoose";

const mobilePushTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    provider: { type: String, default: "expo", trim: true, lowercase: true },
    platform: { type: String, default: "unknown", trim: true, lowercase: true },
    app: { type: String, default: "mobile", trim: true, lowercase: true },
    isActive: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

mobilePushTokenSchema.index({ user: 1, token: 1 }, { unique: true });

export const MobilePushToken = mongoose.model("MobilePushToken", mobilePushTokenSchema);
