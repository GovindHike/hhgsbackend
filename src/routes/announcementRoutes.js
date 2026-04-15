import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import { env } from "../config/env.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { ADMIN_ROLES } from "../utils/constants.js";
import { createAnnouncement, getAnnouncements, addReaction, addReply, deleteAnnouncement, updateAnnouncement, editReply, deleteReply } from "../controllers/announcementController.js";

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(env.uploadsDir, "announcements"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/ogg"];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.get("/", protect, announcementReadRateLimiter, getAnnouncements);
router.post("/", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), createAnnouncement);
router.delete("/:id", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), deleteAnnouncement);
router.post("/upload", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "File upload failed" });
  }

  const url = `${req.protocol}://${req.get("host")}/uploads/announcements/${req.file.filename}`;
  res.status(201).json({ url, type: req.file.mimetype.startsWith("video") ? "video" : "image" });
});
router.patch("/:id", protect, announcementWriteRateLimiter, authorize(...ADMIN_ROLES), updateAnnouncement);
router.post("/:id/reactions", protect, announcementWriteRateLimiter, addReaction);
router.post("/:id/replies", protect, announcementWriteRateLimiter, addReply);
router.put("/:id/replies/:replyId", protect, announcementWriteRateLimiter, editReply);
router.delete("/:id/replies/:replyId", protect, announcementWriteRateLimiter, deleteReply);

export default router;
