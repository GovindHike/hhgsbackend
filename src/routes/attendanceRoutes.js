import { Router } from "express";
import { checkIn, checkOut, getAttendance, getMyTodayAttendance } from "../controllers/attendanceController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { ALL_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/me/today", getMyTodayAttendance);
router.post("/check-in", authorize(...ALL_ROLES), checkIn);
router.post("/check-out", authorize(...ALL_ROLES), checkOut);
router.get("/", authorize(...ALL_ROLES), getAttendance);

export default router;
