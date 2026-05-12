import { StatusCodes } from "http-status-codes";
import crypto from "crypto";
import { User } from "../models/User.js";
import { createAuthPayload, signAccessToken, generateTemporaryPassword } from "../utils/token.js";
import { AppError } from "../utils/AppError.js";
import { forgotPasswordTemplate } from "../utils/emailTemplates.js";
import { sendEmail } from "../services/emailService.js";
import { env } from "../config/env.js";
import { exchangeLinkedInAuthCode, saveLinkedInOAuthTokens } from "../services/linkedInService.js";

const buildAuthResponse = (user) => {
  const payload = createAuthPayload(user);

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

  const urlBase = `${req.protocol}://${req.get("host")}/api/users/${req.user._id}/photo`;
  const url = `${urlBase}?t=${Date.now()}`;
  await User.findByIdAndUpdate(req.user._id, {
    profilePhotoUrl: url,
    profilePhotoData: req.file.buffer,
    profilePhotoMime: req.file.mimetype
  });

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

// ---------------------------------------------------------------------------
// LinkedIn OAuth2 – authorize + callback
// ---------------------------------------------------------------------------

/** Temporary in-memory state store (one entry per in-flight OAuth request). */
const _linkedInOAuthStates = new Map();

/**
 * GET /api/auth/linkedin/authorize  (admin-protected)
 * Returns the LinkedIn OAuth consent URL as JSON.
 * The frontend must navigate window.location.href to that URL.
 */
export const linkedInAuthorize = (req, res) => {
  if (!env.linkedInClientId || !env.linkedInRedirectUri) {
    throw new AppError(
      "LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI must be set in .env",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  // Expire state after 10 minutes
  _linkedInOAuthStates.set(state, Date.now() + 10 * 60 * 1000);

  const scope = env.linkedInOAuthScope || "openid profile email w_member_social";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.linkedInClientId,
    redirect_uri: env.linkedInRedirectUri,
    scope,
    state,
  });

  const authorizationUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  // Return the URL as JSON – the frontend does window.location.href = authorizationUrl
  // (a server-side redirect would strip the JWT Authorization header before LinkedIn sees it)
  res.status(StatusCodes.OK).json({ authorizationUrl });
};

/**
 * GET /api/auth/linkedin/callback  (public – LinkedIn redirects here)
 * Exchanges the authorization code for tokens and redirects the admin
 * back to the frontend settings page with the token info.
 */
export const linkedInCallback = async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const msg = encodeURIComponent(String(error_description || error));
    return res.redirect(`${env.frontendUrl}/admin/celebrations?linkedin_error=${msg}`);
  }

  // Validate CSRF state
  const stateExpiry = _linkedInOAuthStates.get(state);
  if (!stateExpiry || Date.now() > stateExpiry) {
    return res.redirect(`${env.frontendUrl}/admin/celebrations?linkedin_error=invalid_or_expired_state`);
  }
  _linkedInOAuthStates.delete(state);

  let tokens;
  try {
    tokens = await exchangeLinkedInAuthCode(String(code), env.linkedInRedirectUri);
  } catch (err) {
    const msg = encodeURIComponent(err.message);
    return res.redirect(`${env.frontendUrl}/admin/celebrations?linkedin_error=${msg}`);
  }

  // Persist the tokens to DB so LinkedIn posting works immediately (no .env restart needed).
  try {
    await saveLinkedInOAuthTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresInSec: tokens.expires_in || 0
    });
  } catch (saveErr) {
    console.error("[LinkedIn] Failed to save tokens to DB:", saveErr.message);
  }

  // Redirect back to the frontend – tokens shown in modal as a backup reference.
  const params = new URLSearchParams({
    linkedin_access_token: tokens.access_token || "",
    linkedin_refresh_token: tokens.refresh_token || "",
    linkedin_expires_in: String(tokens.expires_in || ""),
  });
  return res.redirect(`${env.frontendUrl}/admin/celebrations?${params.toString()}`);
};
