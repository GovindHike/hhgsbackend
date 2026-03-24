import { Router } from "express";
import { checkIn, checkOut, getAttendance, getMyTodayAttendance } from "../controllers/attendanceController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/me/today", getMyTodayAttendance);
router.post("/check-in", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), checkIn);
router.post("/check-out", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), checkOut);
router.get("/", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), getAttendance);

export default router;
