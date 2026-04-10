import { Router } from "express";
import multer from "multer";
import path from "path";
import { createUser, deleteUser, getMentionUsers, getUsers, updateUser, uploadUserPhoto } from "../controllers/userController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { userValidators } from "../validators.js";
import { ADMIN_ROLES } from "../utils/constants.js";

const router = Router();

const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), "uploads", "profiles"));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.get("/mentions", protect, getMentionUsers);
router.use(protect, authorize(...ADMIN_ROLES));
router.route("/").get(getUsers).post(validate(userValidators.create), createUser);
router.post("/:id/photo", uploadProfile.single("photo"), uploadUserPhoto);
router.route("/:id").patch(validate(userValidators.update), updateUser).delete(deleteUser);

export default router;
