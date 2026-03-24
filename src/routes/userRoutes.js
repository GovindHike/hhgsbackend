import { Router } from "express";
import { createUser, deleteUser, getUsers, updateUser } from "../controllers/userController.js";
import { authorize, protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import { userValidators } from "../validators.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.use(protect, authorize(ROLES.ADMIN));
router.route("/").get(getUsers).post(validate(userValidators.create), createUser);
router.route("/:id").patch(validate(userValidators.update), updateUser).delete(deleteUser);

export default router;
