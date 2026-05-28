import { Router } from "express";
import {
	getNotifications,
	getPushPublicKey,
	markAllNotificationsRead,
	markNotificationRead,
	registerPushToken,
	subscribePush,
	unregisterPushToken,
	unsubscribePush
} from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { notificationValidators } from "../validators.js";

const router = Router();

router.use(protect);
router.get("/", getNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
router.get("/push/public-key", getPushPublicKey);
router.post("/push/subscribe", validate(notificationValidators.subscribePush), subscribePush);
router.post("/push/unsubscribe", validate(notificationValidators.unsubscribePush), unsubscribePush);
router.post("/push/register", validate(notificationValidators.registerPushToken), registerPushToken);
router.post("/push/unregister", validate(notificationValidators.unregisterPushToken), unregisterPushToken);
router.post("/push-token", validate(notificationValidators.registerPushToken), registerPushToken);
router.delete("/push-token", validate(notificationValidators.unregisterPushToken), unregisterPushToken);

export default router;
