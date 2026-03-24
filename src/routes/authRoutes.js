import { Router } from "express";
import { changePassword, getMe, login, resetPassword } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { authValidators } from "../validators.js";

const router = Router();

router.post("/login", validate(authValidators.login), login);
router.post("/reset-password", validate(authValidators.resetPassword), resetPassword);
router.get("/me", protect, getMe);
router.post("/change-password", protect, validate(authValidators.changePassword), changePassword);

export default router;
