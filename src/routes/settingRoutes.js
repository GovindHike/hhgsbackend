import { Router } from "express";
import Joi from "joi";
import { getTheme, updateTheme } from "../controllers/settingController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.get("/theme", getTheme);
router.post(
  "/theme",
  protect,
  authorize(ROLES.ADMIN),
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

export default router;
