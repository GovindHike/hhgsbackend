import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/token.js";
import { AppError } from "../utils/AppError.js";

export const protect = async (req, _res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : null;

  if (!token) {
    return next(new AppError("Authentication required", StatusCodes.UNAUTHORIZED));
  }

  const decoded = verifyAccessToken(token);
  const user = await User.findById(decoded.id).select("-password");

  if (!user || !user.isActive) {
    return next(new AppError("User is no longer active", StatusCodes.UNAUTHORIZED));
  }

  req.user = user;
  next();
};

export const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError("You are not authorized to access this resource", StatusCodes.FORBIDDEN));
  }

  next();
};
