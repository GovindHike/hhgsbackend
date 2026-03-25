import { Router } from "express";
import { createAsset, deleteAsset, getAssets, recordAssetMovement, updateAsset } from "../controllers/assetController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { assetValidators } from "../validators.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect);
router.get("/", authorize(ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.TEAM_LEAD), getAssets);
router.post("/", authorize(ROLES.ADMIN), validate(assetValidators.create), createAsset);
router.patch("/:id", authorize(ROLES.ADMIN), validate(assetValidators.update), updateAsset);
router.delete("/:id", authorize(ROLES.ADMIN), deleteAsset);
router.post(
  "/:id/movements",
  authorize(ROLES.ADMIN, ROLES.EMPLOYEE),
  validate(assetValidators.movement),
  recordAssetMovement
);

export default router;
