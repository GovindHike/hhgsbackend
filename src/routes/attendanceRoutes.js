import { Router } from "express";
import { adminForceCheckout, checkIn, checkOut, getAttendance, getAttendanceSummary, getMyTodayAttendance } from "../controllers/attendanceController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { ADMIN_ROLES, ALL_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/me/today", getMyTodayAttendance);
router.get("/summary", authorize(...ALL_ROLES), getAttendanceSummary);
router.post("/check-in", authorize(...ALL_ROLES), checkIn);
router.post("/check-out", authorize(...ALL_ROLES), checkOut);
router.get("/", authorize(...ALL_ROLES), getAttendance);

// Admin: record a checkout on any open attendance session
router.post("/:id/admin-checkout", authorize(...ADMIN_ROLES), adminForceCheckout);

export default router;
