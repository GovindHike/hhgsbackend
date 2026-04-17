import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { env } from "../config/env.js";
import { getMobileVersion, uploadMobileApk, downloadMobileApk } from "../controllers/mobileController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

const MOBILE_DIR = path.join(env.uploadsDir, "mobile");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(MOBILE_DIR)) {
      fs.mkdirSync(MOBILE_DIR, { recursive: true });
    }
    cb(null, MOBILE_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `app-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      file.mimetype === "application/vnd.android.package-archive" ||
      file.mimetype === "application/octet-stream" ||
      ext === ".apk"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only APK files are allowed"));
    }
  },
});

// Public (auth required) — all authenticated mobile clients can check version
router.get("/version", protect, getMobileVersion);

// Authenticated download — streams the APK to the device
router.get("/download", protect, downloadMobileApk);

// Admin-only — upload a new APK with version metadata
router.post(
  "/upload",
  protect,
  authorize(...ADMIN_ROLES),
  upload.single("apk"),
  uploadMobileApk
);

export default router;
