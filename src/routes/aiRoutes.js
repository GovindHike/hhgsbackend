import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { getNews, generatePost, generateImage, publishPost } from "../controllers/aiController.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.use(authorize(...ADMIN_ROLES));

router.get("/news", getNews);
router.post("/generate-post", generatePost);
router.post("/generate-image", generateImage);
router.post("/publish", publishPost);

export default router;
