import { Router } from "express";
import {
	createTask,
	commandTask,
	createSubtask,
	deleteSubtask,
	deleteTask,
	editCommand,
	deleteCommand,
	reactToCommand,
	getTasks,
	reorderSubtasks,
	toggleSubtask,
	updateSubtask,
	updateTask,
	updateTaskStatus
} from "../controllers/taskController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { taskValidators } from "../validators.js";
import { ALL_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/", getTasks);
router.post("/", authorize(...ALL_ROLES), validate(taskValidators.create), createTask);
router.patch("/:id/status", validate(taskValidators.updateStatus), updateTaskStatus);
router.patch("/:id", authorize(...ALL_ROLES), validate(taskValidators.update), updateTask);
router.post("/:id/command", authorize(...ALL_ROLES), validate(taskValidators.command), commandTask);
router.patch("/:id/command/:commandId", authorize(...ALL_ROLES), validate(taskValidators.editCommand), editCommand);
router.patch("/:id/command/:commandId/react", authorize(...ALL_ROLES), reactToCommand);
router.delete("/:id/command/:commandId", authorize(...ALL_ROLES), deleteCommand);
router.post("/:id/subtasks", authorize(...ALL_ROLES), validate(taskValidators.createSubtask), createSubtask);
router.patch("/:id/subtasks/reorder", authorize(...ALL_ROLES), validate(taskValidators.reorderSubtasks), reorderSubtasks);
router.patch("/:id/subtasks/:subtaskId", authorize(...ALL_ROLES), validate(taskValidators.updateSubtask), updateSubtask);
router.patch("/:id/subtasks/:subtaskId/toggle", authorize(...ALL_ROLES), toggleSubtask);
router.delete("/:id/subtasks/:subtaskId", authorize(...ALL_ROLES), deleteSubtask);
router.delete("/:id", authorize(...ALL_ROLES), deleteTask);

export default router;
