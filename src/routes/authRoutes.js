import { Router } from "express";
import rateLimit from "express-rate-limit";
import { changePassword, getMe, login, resetPassword } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { env } from "../config/env.js";
import { authValidators } from "../validators.js";

const router = Router();

const authRateLimiter = rateLimit({
	windowMs: env.authRateLimitWindowMs,
	limit: env.authRateLimitMax,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res) => {
		const resetTime = req.rateLimit?.resetTime;
		const retryAfterSeconds = resetTime instanceof Date
			? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
			: undefined;

		res.status(429).json({
			message: "Too many authentication requests. Please try again later.",
			retryAfterSeconds
		});
	}
});

router.post("/login", authRateLimiter, validate(authValidators.login), login);
router.post("/reset-password", authRateLimiter, validate(authValidators.resetPassword), resetPassword);
router.get("/me", protect, getMe);
router.post("/change-password", protect, authRateLimiter, validate(authValidators.changePassword), changePassword);

export default router;
