import { Router } from "express";
import {
  createRegister,
  createRegisterEntry,
  deleteRegister,
  deleteRegisterEntry,
  getRegister,
  getRegisterEntries,
  getRegisterTemplates,
  getRegisters,
  updateRegister,
  updateRegisterEntry
} from "../controllers/registerController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { registerValidators } from "../validators.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.use(authorize(...ADMIN_ROLES));

router.get("/templates", getRegisterTemplates);
router.get("/", getRegisters);
router.post("/", validate(registerValidators.create), createRegister);
router.get("/:id", getRegister);
router.patch("/:id", validate(registerValidators.update), updateRegister);
router.delete("/:id", deleteRegister);

router.get("/:id/entries", getRegisterEntries);
router.post("/:id/entries", validate(registerValidators.entry), createRegisterEntry);
router.patch("/:id/entries/:entryId", validate(registerValidators.entry), updateRegisterEntry);
router.delete("/:id/entries/:entryId", deleteRegisterEntry);

export default router;
