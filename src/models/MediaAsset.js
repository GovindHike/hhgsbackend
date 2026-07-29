import mongoose from "mongoose";

/**
 * Binary media stored directly in MongoDB — the same approach used for user
 * profile photos (User.profilePhotoData / profilePhotoMime).
 *
 * Announcement uploads and generated celebration cards live here instead of on
 * the server filesystem, so the images survive redeploys and container restarts
 * and are served back through GET /api/media/:id.
 */
const mediaAssetSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true, select: false },
    mime: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["image", "video"], required: true },
    size: { type: Number, default: 0 },
    filename: { type: String, trim: true, default: "" },
    category: {
      type: String,
      enum: ["announcement", "celebration", "preview"],
      default: "announcement",
      index: true
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Set only for throw-away assets (admin card previews). MongoDB removes the
    // document automatically once this date passes; null means keep forever.
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

mediaAssetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MediaAsset = mongoose.model("MediaAsset", mediaAssetSchema);
