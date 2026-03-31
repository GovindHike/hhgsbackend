import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { createAnnouncement, getAnnouncements, addReaction, addReply, deleteAnnouncement } from "../controllers/announcementController.js";

const router = Router();

const announcementRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many announcement requests. Please try again in a minute."
});

router.use(announcementRateLimiter);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), "uploads", "announcements"));
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

router.get("/", protect, getAnnouncements);
router.post("/", protect, authorize("Admin"), createAnnouncement);
router.delete("/:id", protect, authorize("Admin"), deleteAnnouncement);
router.post("/upload", protect, authorize("Admin"), upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "File upload failed" });
  }

  const url = `${req.protocol}://${req.get("host")}/uploads/announcements/${req.file.filename}`;
  res.status(201).json({ url, type: req.file.mimetype.startsWith("video") ? "video" : "image" });
});
router.post("/:id/reactions", protect, addReaction);
router.post("/:id/replies", protect, addReply);

export default router;
