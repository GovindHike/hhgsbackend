import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
	changePassword,
	getMe,
	login,
	resetPassword,
	uploadProfilePhoto,
	linkedInAuthorize,
	linkedInAuthStatus,
	linkedInCallback,
	linkedInCallbackSimple,
	linkedInStartRedirect,
} from "../controllers/authController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { authValidators } from "../validators.js";
import { env } from "../config/env.js";
import { ADMIN_ROLES } from "../utils/constants.js";

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

const profileStorage = multer.memoryStorage();

const uploadProfile = multer({
	storage: profileStorage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
		cb(null, allowed.includes(file.mimetype));
	}
});

router.post("/login", authRateLimiter, validate(authValidators.login), login);
router.post("/reset-password", authRateLimiter, validate(authValidators.resetPassword), resetPassword);
router.get("/me", protect, getMe);
router.post("/change-password", protect, authRateLimiter, validate(authValidators.changePassword), changePassword);
router.post("/profile-photo", protect, uploadProfile.single("photo"), uploadProfilePhoto);

// LinkedIn OAuth2 – start the flow (admin only) and receive the callback
router.get("/status", linkedInAuthStatus);
router.get("/linkedin", linkedInStartRedirect);
router.get("/linkedin/authorize", protect, authorize(...ADMIN_ROLES), linkedInAuthorize);
router.get("/callback", linkedInCallbackSimple);
router.get("/linkedin/callback", linkedInCallback);

export default router;
