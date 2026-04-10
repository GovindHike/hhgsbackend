import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { signAccessToken, generateTemporaryPassword } from "../utils/token.js";
import { AppError } from "../utils/AppError.js";
import { forgotPasswordTemplate } from "../utils/emailTemplates.js";
import { sendEmail } from "../services/emailService.js";

const buildAuthResponse = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    email: user.email,
    name: user.name,
    team: user.team || null,
    profilePhotoUrl: user.profilePhotoUrl || ""
  };

  return {
    token: signAccessToken(payload),
    user: payload,
    isFirstLogin: user.isFirstLogin
  };
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user || !user.isActive || !(await user.comparePassword(password))) {
    throw new AppError("Invalid credentials", StatusCodes.UNAUTHORIZED);
  }

  res.status(StatusCodes.OK).json(buildAuthResponse(user));
};

export const getMe = async (req, res) => {
  res.status(StatusCodes.OK).json({ user: req.user });
};

export const changePassword = async (req, res) => {
  const user = await User.findById(req.user._id).select("+password");
  const { currentPassword, newPassword } = req.body;

  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError("Current password is incorrect", StatusCodes.BAD_REQUEST);
  }

  user.password = newPassword;
  user.isFirstLogin = false;
  await user.save();

  res.status(StatusCodes.OK).json(buildAuthResponse(user));
};

export const uploadProfilePhoto = async (req, res) => {
  if (!req.file) {
    throw new AppError("No file uploaded", StatusCodes.BAD_REQUEST);
  }
  const url = `${req.protocol}://${req.get("host")}/uploads/profiles/${req.file.filename}`;
  await User.findByIdAndUpdate(req.user._id, { profilePhotoUrl: url });
  res.status(StatusCodes.OK).json({ url });
};

export const resetPassword = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  const temporaryPassword = generateTemporaryPassword();
  user.password = temporaryPassword;
  user.isFirstLogin = true;
  await user.save();

  const mail = forgotPasswordTemplate({
    name: user.name,
    email: user.email,
    password: temporaryPassword
  });

  try {
    await sendEmail({ to: user.email, ...mail });
  } catch (error) {
    throw new AppError(`Failed to send reset email: ${error.message}`, StatusCodes.INTERNAL_SERVER_ERROR);
  }

  res.status(StatusCodes.OK).json({ message: "Password reset email sent" });
};
