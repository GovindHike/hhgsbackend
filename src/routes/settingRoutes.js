import { Router } from "express";
import Joi from "joi";
import { getAttendancePolicy, getTheme, updateAttendancePolicy, updateTheme } from "../controllers/settingController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { ADMIN_ROLES } from "../utils/constants.js";
import { settingValidators } from "../validators.js";

const router = Router();

router.get("/theme", getTheme);
router.get("/attendance-policy", protect, getAttendancePolicy);
router.post(
  "/theme",
  protect,
  authorize(...ADMIN_ROLES),
  validate(
    Joi.object({
      primaryColor: Joi.string()
        .trim()
        .pattern(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
        .required()
    })
  ),
  updateTheme
);

router.post(
  "/attendance-policy",
  protect,
  authorize(...ADMIN_ROLES),
  validate(settingValidators.updateAttendancePolicy),
  updateAttendancePolicy
);

export default router;
