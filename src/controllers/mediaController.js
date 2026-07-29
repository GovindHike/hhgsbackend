import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../utils/AppError.js";
import { MediaAsset } from "../models/MediaAsset.js";
import {
  ALLOWED_MEDIA_MIMES,
  buildMediaUrl,
  getRequestBaseUrl,
  kindFromMime,
  saveMediaAsset
} from "../services/mediaService.js";

/**
 * Stream a stored media asset back to the browser.
 *
 * Public (no auth) for the same reason as GET /api/users/:id/photo — an <img>
 * or <video> tag cannot attach the Authorization header. Ids are random
 * ObjectIds, so the bytes are only reachable by someone who already has the URL.
 */
export const getMedia = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Media not found", StatusCodes.NOT_FOUND);
  }

  const asset = await MediaAsset.findById(id).select("+data").lean();
  if (!asset?.data) {
    throw new AppError("Media not found", StatusCodes.NOT_FOUND);
  }

  const buffer = Buffer.isBuffer(asset.data)
    ? asset.data
    : Buffer.from(asset.data.buffer || asset.data);

  // The id never points at different bytes, so the response can be cached hard.
  const etag = `"${id}"`;
  if (req.headers["if-none-match"] === etag) {
    return res.status(StatusCodes.NOT_MODIFIED).end();
  }

  res.setHeader("Content-Type", asset.mime || "application/octet-stream");
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("ETag", etag);
  res.setHeader(
    "Cache-Control",
    asset.expiresAt ? "public, max-age=3600" : "public, max-age=31536000, immutable"
  );
  return res.send(buffer);
};

/** Save an uploaded announcement image/video into MongoDB and return its URL. */
export const uploadMedia = async (req, res) => {
  if (!req.file) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "File upload failed. Allowed types: images (jpeg, png, gif, webp) and videos (mp4, webm, ogg)."
    });
  }

  if (!ALLOWED_MEDIA_MIMES.includes(req.file.mimetype)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Unsupported file type" });
  }

  const asset = await saveMediaAsset({
    buffer: req.file.buffer,
    mime: req.file.mimetype,
    filename: req.file.originalname || "",
    category: "announcement",
    createdBy: req.user?._id || null
  });

  return res.status(StatusCodes.CREATED).json({
    url: buildMediaUrl(getRequestBaseUrl(req), asset._id),
    type: kindFromMime(req.file.mimetype)
  });
};
