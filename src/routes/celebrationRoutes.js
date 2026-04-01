import { Router } from "express";
import Joi from "joi";
import {
  getCelebrationTemplates,
  triggerCelebrations,
  updateCelebrationTemplates
} from "../controllers/celebrationController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

const templateSectionSchema = Joi.object({
  titleTemplate: Joi.string().allow(""),
  contentTemplate: Joi.string().allow(""),
  defaultQuote: Joi.string().allow(""),
  imageTemplate: Joi.string().allow("")
});

router.get("/templates", protect, authorize(...ADMIN_ROLES), getCelebrationTemplates);
router.post(
  "/templates",
  protect,
  authorize(...ADMIN_ROLES),
  validate(
    Joi.object({
      templates: Joi.object({
        birthday: templateSectionSchema,
        anniversary: templateSectionSchema
      }).required()
    })
  ),
  updateCelebrationTemplates
);

router.post(
  "/trigger",
  protect,
  authorize(...ADMIN_ROLES),
  validate(
    Joi.object({
      date: Joi.date().iso().optional()
    })
  ),
  triggerCelebrations
);

export default router;
