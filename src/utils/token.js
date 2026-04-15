import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env.js";

const SESSION_RENEWAL_WINDOW_SECONDS = 6 * 60 * 60;

export const createAuthPayload = (user) => ({
  id: user._id || user.id,
  role: user.role,
  email: user.email,
  name: user.name,
  team: user.team || null,
  profilePhotoUrl: user.profilePhotoUrl || ""
});

export const signAccessToken = (payload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const verifyAccessToken = (token, options = {}) => jwt.verify(token, env.jwtSecret, options);

const shouldRenewSession = (decoded) => {
  if (!decoded?.exp) {
    return true;
  }

  const secondsUntilExpiry = decoded.exp - Math.floor(Date.now() / 1000);
  return secondsUntilExpiry <= SESSION_RENEWAL_WINDOW_SECONDS;
};

export const validateSessionToken = (token) => {
  try {
    const decoded = verifyAccessToken(token);
    return {
      decoded,
      shouldRenew: shouldRenewSession(decoded)
    };
  } catch (error) {
    if (error?.name !== "TokenExpiredError") {
      throw error;
    }

    const decoded = verifyAccessToken(token, { ignoreExpiration: true });
    return {
      decoded,
      shouldRenew: true
    };
  }
};

export const generateTemporaryPassword = () => crypto.randomBytes(6).toString("base64url");
