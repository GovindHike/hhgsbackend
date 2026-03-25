import { Router } from "express";
import { createTask, deleteTask, getTasks, updateTaskStatus } from "../controllers/taskController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { taskValidators } from "../validators.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/", getTasks);
router.post("/", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), validate(taskValidators.create), createTask);
router.patch("/:id/status", validate(taskValidators.updateStatus), updateTaskStatus);
router.delete("/:id", authorize(ROLES.ADMIN, ROLES.TEAM_LEAD, ROLES.EMPLOYEE), deleteTask);

export default router;
