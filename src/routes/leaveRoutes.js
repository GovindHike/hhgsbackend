import { Router } from "express";
import { createLeave, cancelLeave, decideLeave, deleteLeave, getLeaveBalance, getLeaves } from "../controllers/leaveController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { leaveValidators } from "../validators.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/balance", getLeaveBalance);
router.get("/", getLeaves);
router.post("/", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), validate(leaveValidators.create), createLeave);
router.patch("/:id/decision", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD), validate(leaveValidators.decide), decideLeave);
router.patch("/:id/cancel", authorize(ROLES.TEAM_LEAD, ROLES.EMPLOYEE), cancelLeave);
router.delete("/:id", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), deleteLeave);

export default router;
