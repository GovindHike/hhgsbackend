import { Router } from "express";
import Joi from "joi";
import { previewDailyStatusReport, sendBroadcastEmail, sendDailyStatusReport } from "../controllers/adminController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect, authorize(...ADMIN_ROLES));
router.post(
  "/broadcast-email",
  validate(
    Joi.object({
      subject: Joi.string().required(),
      body: Joi.string().required()
    })
  ),
  sendBroadcastEmail
);
router.get("/daily-status-report/preview", previewDailyStatusReport);
router.post("/daily-status-report", sendDailyStatusReport);

export default router;
