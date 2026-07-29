import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { Announcement } from "../models/Announcement.js";
import { buildMediaUrl, saveMediaAsset } from "../services/mediaService.js";

const LEGACY_MARKER = "/uploads/announcements/";

const MIME_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg"
};

const mimeFromFilename = (filename) =>
  MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] || "application/octet-stream";

/**
 * Move announcement and celebration-card images that were written to
 * uploads/announcements before media moved into MongoDB.
 *
 * Idempotent: only URLs still pointing at /uploads/announcements/ whose file is
 * present on disk are converted, and the original file is left untouched.
 */
export const migrateAnnouncementMedia = async () => {
  let migratedAssets = 0;
  let migratedPosts = 0;
  let missingFiles = 0;

  try {
    const announcements = await Announcement.find({ "media.url": { $regex: LEGACY_MARKER } });

    for (const announcement of announcements) {
      let changed = false;

      for (const item of announcement.media) {
        const url = String(item.url || "");
        if (!url.includes(LEGACY_MARKER)) continue;

        const filename = path.basename(url.split("?")[0]);
        const localPath = path.join(env.uploadsDir, "announcements", filename);

        if (!fs.existsSync(localPath)) {
          missingFiles += 1;
          continue;
        }

        const buffer = fs.readFileSync(localPath);
        const asset = await saveMediaAsset({
          buffer,
          mime: mimeFromFilename(filename),
          filename,
          category: filename.startsWith("birthday-") || filename.startsWith("anniversary-")
            ? "celebration"
            : "announcement",
          createdBy: announcement.createdBy || null
        });

        item.url = buildMediaUrl(env.backendUrl, asset._id);
        migratedAssets += 1;
        changed = true;
      }

      if (changed) {
        await announcement.save();
        migratedPosts += 1;
      }
    }

    if (migratedAssets || missingFiles) {
      console.log(
        `[media migration] Moved ${migratedAssets} file(s) into MongoDB across ${migratedPosts} announcement(s).` +
        (missingFiles ? ` ${missingFiles} referenced file(s) were missing on disk and left unchanged.` : "")
      );
    }
  } catch (error) {
    console.error("[media migration] Failed:", error.message);
  }

  return { migratedAssets, migratedPosts, missingFiles };
};
