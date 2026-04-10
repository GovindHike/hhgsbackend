import { Router } from "express";
import { createLeave, cancelLeave, decideLeave, deleteLeave, getLeaveBalance, getLeaves } from "../controllers/leaveController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { leaveValidators } from "../validators.js";
import { ADMIN_ROLES, TEAM_LEAD_ROLES, EMPLOYEE_ROLES, ALL_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/balance", getLeaveBalance);
router.get("/", getLeaves);
router.post("/", authorize(...ALL_ROLES), validate(leaveValidators.create), createLeave);
router.patch("/:id/decision", authorize(...ADMIN_ROLES, ...TEAM_LEAD_ROLES), validate(leaveValidators.decide), decideLeave);
router.patch("/:id/cancel", authorize(...ADMIN_ROLES, ...TEAM_LEAD_ROLES, ...EMPLOYEE_ROLES), cancelLeave);
router.delete("/:id", authorize(...ALL_ROLES), deleteLeave);

export default router;
