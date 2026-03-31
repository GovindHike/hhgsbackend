import { Router } from "express";
import { createTask, commandTask, deleteTask, getTasks, updateTaskStatus } from "../controllers/taskController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { taskValidators } from "../validators.js";
import { ALL_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/", getTasks);
router.post("/", authorize(...ALL_ROLES), validate(taskValidators.create), createTask);
router.patch("/:id/status", validate(taskValidators.updateStatus), updateTaskStatus);
router.post("/:id/command", authorize(...ALL_ROLES), validate(taskValidators.command), commandTask);
router.delete("/:id", authorize(...ALL_ROLES), deleteTask);

export default router;
