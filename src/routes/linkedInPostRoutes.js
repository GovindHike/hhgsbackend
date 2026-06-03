import { Router } from "express";
import multer from "multer";
import { postToLinkedIn } from "../controllers/linkedInPostController.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/post", upload.single("photo"), postToLinkedIn);

export default router;
