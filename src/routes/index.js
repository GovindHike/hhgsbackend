import { Router } from "express";
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import teamRoutes from "./teamRoutes.js";
import assetRoutes from "./assetRoutes.js";
import taskRoutes from "./taskRoutes.js";
import attendanceRoutes from "./attendanceRoutes.js";
import leaveRoutes from "./leaveRoutes.js";
import adminRoutes from "./adminRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import settingRoutes from "./settingRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/teams", teamRoutes);
router.use("/assets", assetRoutes);
router.use("/tasks", taskRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/leaves", leaveRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationRoutes);
router.use("/settings", settingRoutes);

export default router;
