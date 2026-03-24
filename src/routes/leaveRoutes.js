import { Router } from "express";
import { createLeave, decideLeave, getLeaves } from "../controllers/leaveController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { leaveValidators } from "../validators.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/", getLeaves);
router.post("/", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), validate(leaveValidators.create), createLeave);
router.patch("/:id/decision", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD), validate(leaveValidators.decide), decideLeave);

export default router;
