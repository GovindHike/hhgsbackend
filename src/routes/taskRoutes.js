import { Router } from "express";
import { createTask, commandTask, deleteTask, editCommand, deleteCommand, getTasks, updateTask, updateTaskStatus } from "../controllers/taskController.js";
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
router.delete("/:id/command/:commandId", authorize(...ALL_ROLES), deleteCommand);
router.delete("/:id", authorize(...ALL_ROLES), deleteTask);

export default router;
