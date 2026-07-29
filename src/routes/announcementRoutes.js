import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { env } from "../config/env.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { ADMIN_ROLES } from "../utils/constants.js";
import { createAnnouncement, getAnnouncements, addReaction, addReply, deleteAnnouncement, updateAnnouncement, editReply, deleteReply } from "../controllers/announcementController.js";
import { uploadMedia } from "../controllers/mediaController.js";
import { ALLOWED_MEDIA_MIMES, MAX_MEDIA_BYTES } from "../services/mediaService.js";

const router = Router();

const createAnnouncementRateLimiter = (windowMs, limit, message) => rateLimit({
  windowMs,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime instanceof Date
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : undefined;

    res.status(429).json({
      message,
      retryAfterSeconds
    });
  }
});

const announcementReadRateLimiter = createAnnouncementRateLimiter(
  env.announcementReadRateLimitWindowMs,
  env.announcementReadRateLimitMax,
  "Too many announcement requests. Please try again in a minute."
);

const announcementWriteRateLimiter = createAnnouncementRateLimiter(
  env.announcementWriteRateLimitWindowMs,
  env.announcementWriteRateLimitMax,
  "Too many announcement updates. Please try again in a minute."
);

// Uploads are kept in memory and written straight into MongoDB (see mediaService),
// mirroring how profile photos are stored.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MEDIA_MIMES.includes(file.mimetype));
  }
});

const maxMediaMb = Math.round(MAX_MEDIA_BYTES / (1024 * 1024));

// A MongoDB document cannot exceed 16 MB, so an oversized file is a plain
// validation error rather than a server fault.
const uploadSingleMedia = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: `File is too large. Maximum size is ${maxMediaMb} MB.` });
    }
    return next(err);
  });
};

router.get("/", protect, announcementReadRateLimiter, getAnnouncements);
router.post("/", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), createAnnouncement);
router.delete("/:id", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), deleteAnnouncement);
router.post("/upload", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), uploadSingleMedia, uploadMedia);
router.patch("/:id", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), updateAnnouncement);
router.post("/:id/reactions", protect, announcementWriteRateLimiter, addReaction);
router.post("/:id/replies", protect, announcementWriteRateLimiter, addReply);
router.put("/:id/replies/:replyId", protect, announcementWriteRateLimiter, editReply);
router.delete("/:id/replies/:replyId", protect, announcementWriteRateLimiter, deleteReply);

export default router;
