import { Router } from "express";
import { createAsset, deleteAsset, getAssets, recordAssetMovement, recordAssetComplaint, updateAsset } from "../controllers/assetController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { assetValidators } from "../validators.js";
import { ADMIN_ROLES, EMPLOYEE_ROLES, ALL_ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/", authorize(...ALL_ROLES), getAssets);
router.post("/", authorize(...ADMIN_ROLES), validate(assetValidators.create), createAsset);
router.patch("/:id", authorize(...ADMIN_ROLES), validate(assetValidators.update), updateAsset);
router.delete("/:id", authorize(...ADMIN_ROLES), deleteAsset);
router.post(
  "/:id/movements",
  authorize(...ADMIN_ROLES, ...EMPLOYEE_ROLES),
  validate(assetValidators.movement),
  recordAssetMovement
);

router.post(
  "/:id/complaints",
  authorize(...ADMIN_ROLES),
  validate(assetValidators.complaint),
  recordAssetComplaint
);

export default router;
