import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { getActivityStatuses } from "../controllers/activityController.js";
import { ADMIN_ROLES, TEAM_LEAD_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/statuses", authorize(...ADMIN_ROLES, ...TEAM_LEAD_ROLES), getActivityStatuses);

export default router;
