import { Router } from "express";
import multer from "multer";
import { createUser, deleteUser, getMentionUsers, getUsers, getUserPhoto, updateUser, uploadUserPhoto } from "../controllers/userController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { userValidators } from "../validators.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

const profileStorage = multer.memoryStorage();

const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.get("/mentions", protect, getMentionUsers);
router.get("/:id/photo", getUserPhoto);
router.use(protect, authorize(...ADMIN_ROLES));
router.route("/").get(getUsers).post(validate(userValidators.create), createUser);
router.post("/:id/photo", uploadProfile.single("photo"), uploadUserPhoto);
router.route("/:id").patch(validate(userValidators.update), updateUser).delete(deleteUser);

export default router;
