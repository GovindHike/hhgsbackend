import { StatusCodes } from "http-status-codes";
import crypto from "crypto";
import { User } from "../models/User.js";
import { createAuthPayload, signAccessToken, generateTemporaryPassword } from "../utils/token.js";
import { AppError } from "../utils/AppError.js";
import { forgotPasswordTemplate } from "../utils/emailTemplates.js";
import { sendEmail } from "../services/emailService.js";
import { env } from "../config/env.js";
import {
  exchangeLinkedInAuthCode,
  fetchLinkedInUserInfo,
  getLinkedInRuntimeConfig,
  saveLinkedInOAuthTokens,
} from "../services/linkedInService.js";

const buildAuthResponse = (user) => {
  const payload = createAuthPayload(user);

  return {
    token: signAccessToken(payload),
    user: payload,
    isFirstLogin: user.isFirstLogin
  };
};

const buildLinkedInOAuthScope = () => {
  const requiredScopes = ["openid", "profile", "email", "w_member_social"];
  const configuredScopes = String(env.linkedInOAuthScope || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .filter((scope) => scope !== "r_liteprofile");

  return [...new Set([...requiredScopes, ...configuredScopes])].join(" ");
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

const buildLinkedInAuthorizationUrl = (state) => {
  const scope = buildLinkedInOAuthScope();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.linkedInClientId,
    redirect_uri: env.linkedInRedirectUri,
    scope,
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
};

export const linkedInAuthStatus = async (_req, res) => {
  const runtime = await getLinkedInRuntimeConfig();
  res.status(StatusCodes.OK).json({
    configured: runtime.configured,
    name: runtime.accountName || "",
  });
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

  const authorizationUrl = buildLinkedInAuthorizationUrl(state);
  // Return the URL as JSON – the frontend does window.location.href = authorizationUrl
  // (a server-side redirect would strip the JWT Authorization header before LinkedIn sees it)
  res.status(StatusCodes.OK).json({ authorizationUrl });
};

/**
 * GET /api/auth/linkedin  (public redirect endpoint for simple UI integration)
 */
export const linkedInStartRedirect = (req, res) => {
  if (!env.linkedInClientId || !env.linkedInRedirectUri) {
    throw new AppError(
      "LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI must be set in .env",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  _linkedInOAuthStates.set(state, Date.now() + 10 * 60 * 1000);
  const authorizationUrl = buildLinkedInAuthorizationUrl(state);
  return res.redirect(authorizationUrl);
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

  let userInfo;
  try {
    userInfo = await fetchLinkedInUserInfo(tokens.access_token);
  } catch (err) {
    console.error("[LinkedIn] Failed to read /v2/userinfo:", err.message);
    const msg = encodeURIComponent(err.message);
    return res.redirect(`${env.frontendUrl}/admin/celebrations?linkedin_error=${msg}`);
  }

  // Persist the tokens to DB so LinkedIn posting works immediately (no .env restart needed).
  try {
    await saveLinkedInOAuthTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresInSec: tokens.expires_in || 0,
      personId: userInfo.personId,
      accountName: userInfo.accountName,
    });
  } catch (saveErr) {
    console.error("[LinkedIn] Failed to save tokens to DB:", saveErr.message);
  }

  const params = new URLSearchParams({
    linkedin_access_token: tokens.access_token || "",
    linkedin_refresh_token: tokens.refresh_token || "",
    linkedin_expires_in: String(tokens.expires_in || ""),
  });
  return res.redirect(`${env.frontendUrl}/admin/celebrations?${params.toString()}`);
};

export const linkedInCallbackSimple = async (req, res) => {
  const { code, state, error } = req.query;
  const clientBase = env.clientUrl || env.frontendUrl;

  if (error) {
    return res.redirect(`${clientBase}/?error=auth_failed`);
  }

  const stateExpiry = _linkedInOAuthStates.get(state);
  if (!stateExpiry || Date.now() > stateExpiry) {
    return res.redirect(`${clientBase}/?error=auth_failed`);
  }
  _linkedInOAuthStates.delete(state);

  let tokens;
  try {
    tokens = await exchangeLinkedInAuthCode(String(code), env.linkedInRedirectUri);
    const userInfo = await fetchLinkedInUserInfo(tokens.access_token);
    await saveLinkedInOAuthTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresInSec: tokens.expires_in || 0,
      personId: userInfo.personId,
      accountName: userInfo.accountName,
    });
  } catch (err) {
    console.error("[LinkedIn] OAuth callback failed:", err.message);
    return res.redirect(`${clientBase}/?error=auth_failed`);
  }

  return res.redirect(`${clientBase}/dashboard`);
};
