import mongoose from "mongoose";
import { MediaAsset } from "../models/MediaAsset.js";
import { User } from "../models/User.js";

/**
 * A single MongoDB document cannot exceed 16 MB (BSON limit), so uploads are
 * capped a little below that to leave room for the rest of the document.
 */
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

export const ALLOWED_MEDIA_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/ogg"
];

export const kindFromMime = (mime) => (String(mime || "").startsWith("video") ? "video" : "image");

/** Store a buffer in MongoDB and return the saved document (without the bytes). */
export const saveMediaAsset = async ({
  buffer,
  mime,
  filename = "",
  category = "announcement",
  createdBy = null,
  expiresAt = null
}) => {
  if (!buffer || !buffer.length) {
    throw new Error("Media buffer is empty");
  }

  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error(`Media exceeds the ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} MB limit`);
  }

  const asset = await MediaAsset.create({
    data: buffer,
    mime,
    kind: kindFromMime(mime),
    size: buffer.length,
    filename,
    category,
    createdBy,
    expiresAt
  });

  return asset;
};

/** Public URL of a stored asset, e.g. "http://host/api/media/<id>". */
export const buildMediaUrl = (baseUrl, id) => `${String(baseUrl || "").replace(/\/+$/, "")}/api/media/${id}`;

/** Origin of the current request — used to build absolute media URLs. */
export const getRequestBaseUrl = (req) => `${req.protocol}://${req.get("host")}`;

const MEDIA_URL_PATTERN = /\/api\/media\/([a-f\d]{24})/i;
const USER_PHOTO_URL_PATTERN = /\/api\/users\/([a-f\d]{24})\/photo/i;

/** Extract the MediaAsset id from a media URL, or "" when it is not one. */
export const extractMediaId = (url) => {
  const match = MEDIA_URL_PATTERN.exec(String(url || ""));
  return match ? match[1] : "";
};

/** Remove the stored bytes behind the given media URLs (ignores foreign URLs). */
export const deleteMediaByUrls = async (urls = []) => {
  const ids = urls.map(extractMediaId).filter(Boolean);
  if (!ids.length) return 0;

  const result = await MediaAsset.deleteMany({ _id: { $in: ids } });
  return result.deletedCount || 0;
};

/**
 * Read an image straight out of MongoDB when the URL points at one of our own
 * DB-backed endpoints (/api/media/:id or /api/users/:id/photo). Returns null for
 * any other URL so the caller can fall back to an HTTP fetch.
 */
export const loadLocalImageBuffer = async (url) => {
  const text = String(url || "");
  if (!text) return null;

  try {
    const mediaId = extractMediaId(text);
    if (mediaId) {
      const asset = await MediaAsset.findById(mediaId).select("+data").lean();
      return asset?.data ? Buffer.from(asset.data.buffer || asset.data) : null;
    }

    const photoMatch = USER_PHOTO_URL_PATTERN.exec(text);
    if (photoMatch && mongoose.isValidObjectId(photoMatch[1])) {
      const user = await User.findById(photoMatch[1]).select("+profilePhotoData").lean();
      return user?.profilePhotoData
        ? Buffer.from(user.profilePhotoData.buffer || user.profilePhotoData)
        : null;
    }
  } catch {
    return null;
  }

  return null;
};
