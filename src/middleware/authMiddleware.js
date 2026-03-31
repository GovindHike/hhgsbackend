import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/token.js";
import { ADMIN_ROLES, TEAM_LEAD_ROLES, EMPLOYEE_ROLES } from "../utils/constants.js";
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

const normalizeRoleGroup = (role) => {
  if (ADMIN_ROLES.includes(role)) return "Admin";
  if (TEAM_LEAD_ROLES.includes(role)) return "Team Lead";
  if (EMPLOYEE_ROLES.includes(role)) return "Employee";
  return role;
};

export const authorize = (...roles) => (req, _res, next) => {
  const userRole = req.user.role;
  const allowed = roles.includes(userRole);

  if (!allowed) {
    return next(new AppError("You are not authorized to access this resource", StatusCodes.FORBIDDEN));
  }

  next();
};
