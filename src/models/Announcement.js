import mongoose from "mongoose";

const reactionTypes = ["like", "love", "clap", "celebrate", "insightful", "heart"];

const replySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: "" },
    content: { type: String, required: true, trim: true },
    media: [
      {
        type: {
          type: String,
          enum: ["image", "video"],
          required: true,
          trim: true
        },
        url: { type: String, required: true, trim: true }
      }
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: reactionTypes, required: true }
      }
    ],
    replies: [replySchema]
    ,
    autoMeta: {
      source: {
        type: String,
        enum: ["birthday", "work_anniversary"],
        default: null
      },
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      dateKey: { type: String, trim: true, default: "" }
    }
  },
  { timestamps: true }
);

announcementSchema.index({ createdAt: -1 });
announcementSchema.index(
  { "autoMeta.source": 1, "autoMeta.user": 1, "autoMeta.dateKey": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "autoMeta.source": { $exists: true, $ne: null },
      "autoMeta.user": { $exists: true, $ne: null },
      "autoMeta.dateKey": { $exists: true, $ne: "" }
    }
  }
);

export const Announcement = mongoose.model("Announcement", announcementSchema);
export const ANNOUNCEMENT_REACTION_TYPES = reactionTypes;
