import { Router } from "express";
import { createTeam, getTeams, updateTeam } from "../controllers/teamController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { teamValidators } from "../validators.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/", getTeams);
router.post("/", authorize(...ADMIN_ROLES), validate(teamValidators.create), createTeam);
router.patch("/:id", authorize(...ADMIN_ROLES), validate(teamValidators.update), updateTeam);

export default router;
