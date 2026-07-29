import { Router } from "express";
import { getMedia } from "../controllers/mediaController.js";

const router = Router();

// Public — <img>/<video> tags cannot send the Authorization header.
router.get("/:id", getMedia);

export default router;
