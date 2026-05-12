import https from "https";
import fs from "fs";
import { env } from "../config/env.js";
import { Setting } from "../models/Setting.js";

const LI_HOST = "api.linkedin.com";
const LI_OAUTH_HOST = "www.linkedin.com";
const LINKEDIN_STABLE_FALLBACK_VERSION = "202504";
const LINKEDIN_SETTING_KEY = "linkedin_oauth";

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Headers common to every LinkedIn REST request. */
function baseHeaders(accessToken, apiVersion) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": apiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function currentLinkedInApiVersion() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

function configuredLinkedInApiVersion() {
  const digits = String(env.linkedInApiVersion || "").replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(0, 6);
  return currentLinkedInApiVersion();
}

function buildLinkedInVersionCandidates(primaryVersion) {
  const candidates = [primaryVersion, LINKEDIN_STABLE_FALLBACK_VERSION, currentLinkedInApiVersion()]
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  // Include recent months as additional fallbacks for sudden LinkedIn deprecations.
  const now = new Date();
  for (let i = 0; i < 24; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const version = `${year}${month}`;
    if (!candidates.includes(version)) {
      candidates.push(version);
    }
  }

  return candidates;
}

function isNonexistentVersionError(response) {
  if (response?.status !== 426) return false;
  const payload = parseJsonBody(response?.body);
  return payload?.code === "NONEXISTENT_VERSION";
}

async function linkedInRestRequest({ method, path, accessToken, body, extraHeaders = {} }) {
  const primaryVersion = configuredLinkedInApiVersion();
  const versionCandidates = buildLinkedInVersionCandidates(primaryVersion);

  const makeRequest = (version) =>
    httpsRequest(
      {
        hostname: LI_HOST,
        path,
        method,
        headers: {
          ...baseHeaders(accessToken, version),
          ...extraHeaders,
        },
      },
      body
    );

  let response = null;
  for (const [idx, version] of versionCandidates.entries()) {
    if (idx > 0) {
      console.warn(`[LinkedIn] Retrying with API version ${version}.`);
    }

    response = await makeRequest(version);
    if (!isNonexistentVersionError(response)) {
      break;
    }
  }

  return response;
}

/**
 * Make an HTTPS request and resolve with { status, headers, body }.
 * `body` may be a Buffer, string, or undefined.
 */
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status:  res.statusCode,
          headers: res.headers,
          body:    Buffer.concat(chunks).toString("utf8"),
        })
      );
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("LinkedIn request timed out")));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function nowMs() {
  return Date.now();
}

function canUseCachedToken() {
  return Boolean(cachedAccessToken) && nowMs() < cachedAccessTokenExpiresAt;
}

function parseJsonBody(responseBody) {
  try {
    return JSON.parse(responseBody || "{}");
  } catch {
    return null;
  }
}

function compactMessage(value, max = 320) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function buildLinkedInForbiddenHint() {
  return (
    "LinkedIn rejected the request (403). Verify that the access token belongs to the same member in LINKEDIN_MEMBER_URN, " +
    "that the app has member posting permission (w_member_social), and that the token is still valid."
  );
}

function isAuthorAccessDenied(responseBody) {
  const payload = parseJsonBody(responseBody);
  return payload?.code === "ACCESS_DENIED" && String(payload?.message || "").includes("/author");
}

/**
 * Read the memberUrn saved to DB during the last OAuth Connect.
 * Returns empty string if not saved yet.
 */
async function getSavedLinkedInMemberUrn() {
  try {
    const dbSetting = await Setting.findOne({ key: LINKEDIN_SETTING_KEY }).lean();
    return dbSetting?.linkedIn?.memberUrn || "";
  } catch {
    return "";
  }
}

async function detectLinkedInAuthorFromToken(accessToken) {
  // 1. Try /v2/me?projection=(id,entityUrn) — returns numeric ID when r_liteprofile scope is present.
  const meRes = await httpsRequest(
    {
      hostname: LI_HOST,
      path: "/v2/me?projection=(id,entityUrn)",
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  const me = meRes.status === 200 ? (parseJsonBody(meRes.body) || {}) : {};
  if (meRes.status !== 200) {
    console.warn("[LinkedIn] /v2/me returned", meRes.status, meRes.body);
  } else {
    console.log("[LinkedIn] /v2/me response:", JSON.stringify(me));
  }

  // entityUrn = "urn:li:member:235670284" — numeric ID, works for both APIs.
  const entityUrn = String(me.entityUrn || "").trim();
  const numericMatch = /^urn:li:member:(\d+)$/.exec(entityUrn);
  if (numericMatch) {
    const numericId = numericMatch[1];
    return {
      memberUrn: `urn:li:member:${numericId}`,
      personUrn: `urn:li:person:${numericId}`,
    };
  }

  // 2. Fall back to the memberUrn saved at OAuth connect time (most reliable —
  //    was resolved when r_liteprofile scope was available during the connect).
  const savedUrn = await getSavedLinkedInMemberUrn();
  const savedNumericMatch = /^urn:li:member:(\d+)$/.exec(savedUrn);
  if (savedNumericMatch) {
    const numericId = savedNumericMatch[1];
    console.log("[LinkedIn] Using saved member URN from DB:", savedUrn);
    return {
      memberUrn: `urn:li:member:${numericId}`,
      personUrn: `urn:li:person:${numericId}`,
    };
  }

  // 3. Last resort: alphanumeric id — only works with REST Posts if LinkedIn accepts it.
  const alphaId = String(me.id || "").trim();
  if (/^[A-Za-z0-9_-]+$/.test(alphaId)) {
    console.warn(
      "[LinkedIn] No numeric member ID available. Reconnect LinkedIn with r_liteprofile scope to fix posting. Alphanumeric id:", alphaId
    );
    return { memberUrn: "", personUrn: `urn:li:person:${alphaId}` };
  }

  return { memberUrn: "", personUrn: "" };
}

async function postTextToLinkedInUgc({ authorUrn, commentary, accessToken }) {
  const ugcBody = JSON.stringify({
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: commentary },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  });

  const ugcRes = await httpsRequest(
    {
      hostname: LI_HOST,
      path: "/v2/ugcPosts",
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(ugcBody),
      },
    },
    ugcBody
  );

  if (ugcRes.status === 201) {
    const ugcId = ugcRes.headers["x-restli-id"] || "(id unavailable)";
    return { ok: true, id: ugcId };
  }

  const suffix = ugcRes.status === 403 ? ` ${buildLinkedInForbiddenHint()}` : "";
  throw new Error(
    `LinkedIn UGC post failed (${ugcRes.status}): ${compactMessage(ugcRes.body) || "No response body"}${suffix}`
  );
}

function buildTokenRequestBody() {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", env.linkedInRefreshToken);
  params.set("client_id", env.linkedInClientId);
  params.set("client_secret", env.linkedInClientSecret);
  return params.toString();
}

async function getLinkedInAccessToken() {
  if (canUseCachedToken()) {
    return cachedAccessToken;
  }

  // DB token (saved via OAuth Connect) takes priority over the static env token.
  // The OAuth connect is an explicit admin action that associates a specific LinkedIn
  // account — the env token may belong to a different account.
  try {
    const dbSetting = await Setting.findOne({ key: LINKEDIN_SETTING_KEY }).lean();
    if (dbSetting?.linkedIn?.accessToken) {
      const { accessToken, expiresAt } = dbSetting.linkedIn;
      if (!expiresAt || Date.now() < expiresAt) {
        cachedAccessToken = accessToken;
        cachedAccessTokenExpiresAt = expiresAt || (Date.now() + 55 * 60 * 1000);
        return cachedAccessToken;
      }
    }
  } catch (dbErr) {
    console.warn("[LinkedIn] Could not read token from DB:", dbErr.message);
  }

  if (env.linkedInAccessToken) {
    // Static access token fallback — used when no DB token is available.
    return env.linkedInAccessToken;
  }

  if (!env.linkedInClientId || !env.linkedInClientSecret || !env.linkedInRefreshToken) {
    console.warn(
      "[LinkedIn] Missing auth config. Set LINKEDIN_ACCESS_TOKEN or the refresh-token credentials"
    );
    return null;
  }

  const requestBody = buildTokenRequestBody();
  const tokenRes = await httpsRequest(
    {
      hostname: LI_OAUTH_HOST,
      path: "/oauth/v2/accessToken",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    },
    requestBody
  );

  if (tokenRes.status !== 200) {
    console.error("[LinkedIn] OAuth token request failed:", tokenRes.status, tokenRes.body);
    return null;
  }

  const tokenPayload = parseJsonBody(tokenRes.body);
  const accessToken = tokenPayload?.access_token;
  const expiresInSec = Number(tokenPayload?.expires_in || 0);

  if (!accessToken) {
    console.error("[LinkedIn] OAuth response missing access_token");
    return null;
  }

  cachedAccessToken = accessToken;
  // Refresh 60 seconds early to avoid edge expiration while uploading.
  cachedAccessTokenExpiresAt = nowMs() + Math.max(expiresInSec - 60, 30) * 1000;
  return cachedAccessToken;
}

function getLinkedInAuthorUrn() {
  const authorUrn = env.linkedInMemberUrn || env.linkedInOrgUrn || "";
  if (!authorUrn) return "";

  const isPersonUrn = /^urn:li:person:[A-Za-z0-9_-]+$/.test(authorUrn);
  const isLegacyMemberUrn = /^urn:li:member:[A-Za-z0-9_-]+$/.test(authorUrn);
  const isOrgUrn = /^urn:li:organization:\d+$/.test(authorUrn);

  if (!isPersonUrn && !isLegacyMemberUrn && !isOrgUrn) {
    console.warn(
      "[LinkedIn] Invalid author URN. Expected urn:li:person:<id>, urn:li:member:<id>, or urn:li:organization:<id>"
    );
    return "";
  }

  // REST Posts API (/rest/posts) requires urn:li:person:<numeric-id> for personal authors.
  // Convert urn:li:member:<numeric> → urn:li:person:<numeric> automatically.
  if (isLegacyMemberUrn) {
    const numericId = authorUrn.replace("urn:li:member:", "");
    if (/^\d+$/.test(numericId)) {
      return `urn:li:person:${numericId}`;
    }
    // Non-numeric member ID — cannot convert, return as-is.
    return authorUrn;
  }

  return authorUrn;
}

function getLinkedInUgcAuthorUrn() {
  const memberUrn = env.linkedInMemberUrn || "";
  const orgUrn = env.linkedInOrgUrn || "";

  if (/^urn:li:organization:\d+$/.test(orgUrn)) {
    return orgUrn;
  }

  // The UGC endpoint accepts urn:li:member:<id> for personal authors.
  if (/^urn:li:member:[A-Za-z0-9_-]+$/.test(memberUrn)) {
    return memberUrn;
  }

  if (/^urn:li:person:[A-Za-z0-9_-]+$/.test(memberUrn)) {
    // urn:li:person: is not accepted by the UGC API — skip it.
    console.warn("[LinkedIn] urn:li:person: is not accepted by the UGC API. Use urn:li:member:<numeric-id> in LINKEDIN_MEMBER_URN.");
    return "";
  }

  return "";
}

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

/**
 * Upload a local PNG/JPEG to the LinkedIn Images API.
 *
 * Uses the two-step flow:
 *   1. POST  /rest/images?action=initializeUpload  → get uploadInstructions + image URN
 *   2. PUT   each uploadUrl with the corresponding byte range
 *
 * Returns the image URN (e.g. "urn:li:image:…") on success.
 * Throws with a detailed reason on failure.
 *
 * Env vars required:
 *   LINKEDIN_ACCESS_TOKEN  – OAuth2 bearer token with posting scope
 *   LINKEDIN_MEMBER_URN or LINKEDIN_ORG_URN
 */
async function uploadImageToLinkedIn(localImagePath, ownerUrn, accessToken) {
  const imageBuffer = fs.readFileSync(localImagePath);

  // ── Step 1: Initialise the upload ────────────────────────────────────────
  const initBody = JSON.stringify({
    initializeUploadRequest: { owner: ownerUrn },
  });

  const initRes = await linkedInRestRequest({
    method: "POST",
    path: "/rest/images?action=initializeUpload",
    accessToken,
    body: initBody,
    extraHeaders: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(initBody),
    },
  });

  if (initRes.status !== 200) {
    throw new Error(
      `LinkedIn image initialize failed (${initRes.status}): ${compactMessage(initRes.body) || "No response body"}`
    );
  }

  let initData;
  try {
    initData = JSON.parse(initRes.body);
  } catch {
    throw new Error("LinkedIn image initialize returned invalid JSON");
  }

  const imageUrn     = initData?.value?.image;
  const instructions = initData?.value?.uploadInstructions || [];

  if (!imageUrn || instructions.length === 0) {
    throw new Error(
      `LinkedIn image initialize response missing upload instructions: ${compactMessage(initRes.body) || "No response body"}`
    );
  }

  // ── Step 2: Upload byte ranges (typically a single chunk for small images) ─
  for (const instruction of instructions) {
    const { uploadUrl, firstByte = 0, lastByte = imageBuffer.length - 1 } = instruction;
    const chunk       = imageBuffer.slice(firstByte, lastByte + 1);
    const parsedUrl   = new URL(uploadUrl);

    await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          path:     parsedUrl.pathname + parsedUrl.search,
          method:   "PUT",
          headers: {
            Authorization:         `Bearer ${accessToken}`,
            "Content-Type":        "application/octet-stream",
            "Content-Length":      chunk.length,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(
                new Error(
                  `LinkedIn image upload chunk failed (${res.statusCode}): ${compactMessage(body) || "No response body"}`
                )
              );
            }
          });
        }
      );
      req.on("error", reject);
      req.setTimeout(30000, () => req.destroy(new Error("Image upload timed out")));
      req.write(chunk);
      req.end();
    });
  }

  return imageUrn;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Post a personalised birthday card with caption to LinkedIn.
 *
 * This function is intentionally non-blocking — the caller should NOT await it.
 * Any error is caught internally so it can never crash the in-app birthday flow.
 *
 * LinkedIn requirements (profile posting):
 *   • A LinkedIn developer app with Share on LinkedIn / Community Management access.
 *   • Member scope like w_member_social.
 *   • LINKEDIN_MEMBER_URN set (e.g. "urn:li:person:xxxxxxxx").
 *
 * Also supported:
 *   • Organization posting with LINKEDIN_ORG_URN and organization scope.
 *   • Auth via either LINKEDIN_ACCESS_TOKEN or client credentials + refresh token.
 *
 * @param {object} p
 * @param {string} p.name            Employee full name
 * @param {string} p.role            Employee designation
 * @param {string} p.commentary      Post caption text
 * @param {string} p.localImagePath  Absolute path to the generated birthday card PNG
 */

// ---------------------------------------------------------------------------
// LinkedIn OAuth2 – authorization_code exchange + token persistence
// ---------------------------------------------------------------------------

/**
 * Persist an access token (and optional refresh token) to the database
 * so the server can post to LinkedIn immediately without restarting.
 */
export async function saveLinkedInOAuthTokens({ accessToken, refreshToken, expiresInSec, memberUrn }) {
  const expiresAt = expiresInSec
    ? Date.now() + (Number(expiresInSec) - 60) * 1000
    : 0;

  const linkedInUpdate = {
    accessToken,
    refreshToken: refreshToken || "",
    expiresAt,
  };

  // Auto-detect the member URN from the token when not explicitly provided.
  // This saves the correct numeric URN at connect-time so postBirthdayToLinkedIn
  // doesn't have to re-detect it (and doesn't have to rely on the env LINKEDIN_MEMBER_URN).
  const resolvedMemberUrn = memberUrn || (await detectLinkedInAuthorFromToken(accessToken)).memberUrn;
  if (resolvedMemberUrn) {
    linkedInUpdate.memberUrn = resolvedMemberUrn;
    console.log("[LinkedIn] Saving member URN to DB:", resolvedMemberUrn);
  }

  await Setting.findOneAndUpdate(
    { key: LINKEDIN_SETTING_KEY },
    { key: LINKEDIN_SETTING_KEY, linkedIn: linkedInUpdate },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Update in-memory cache immediately so the next post doesn't need a DB round-trip.
  cachedAccessToken = accessToken;
  cachedAccessTokenExpiresAt = expiresAt || (Date.now() + 55 * 60 * 1000);
}

/**
 * Exchange a LinkedIn authorization code for access + refresh tokens.
 * Called from the OAuth callback route after LinkedIn redirects back.
 *
 * @param {string} code        The authorization code from LinkedIn's redirect.
 * @param {string} redirectUri Must exactly match the URI registered in LinkedIn Developer Portal.
 * @returns {Promise<{access_token: string, refresh_token?: string, expires_in?: number, refresh_token_expires_in?: number}>}
 */
export async function exchangeLinkedInAuthCode(code, redirectUri) {
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirectUri);
  params.set("client_id", env.linkedInClientId);
  params.set("client_secret", env.linkedInClientSecret);

  const requestBody = params.toString();
  const tokenRes = await httpsRequest(
    {
      hostname: LI_OAUTH_HOST,
      path: "/oauth/v2/accessToken",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    },
    requestBody
  );

  if (tokenRes.status !== 200) {
    throw new Error(`LinkedIn token exchange failed (${tokenRes.status}): ${tokenRes.body}`);
  }

  const payload = parseJsonBody(tokenRes.body);
  if (!payload?.access_token) {
    throw new Error("LinkedIn token response missing access_token");
  }

  return payload;
}

export async function postBirthdayToLinkedIn({ name, role, commentary, localImagePath }) {
  if (!env.linkedInEnabled) {
    throw new Error("LinkedIn integration is disabled");
  }

  const accessToken = await getLinkedInAccessToken();
  if (!accessToken) {
    throw new Error(
      "Could not obtain a LinkedIn access token — check LINKEDIN_ACCESS_TOKEN or reconnect LinkedIn via the Connect button"
    );
  }

  // Resolve the author URN: DB-saved URN (set at OAuth connect) > token-detected > env config.
  // The DB URN is the most reliable because it was saved when the admin explicitly connected
  // their account (with r_liteprofile scope available to return entityUrn).
  const detectedAuthor = await detectLinkedInAuthorFromToken(accessToken);
  const isOrgAuthor = /^urn:li:organization:\d+$/.test(env.linkedInOrgUrn || "");

  let effectiveRestAuthorUrn = "";
  let effectiveUgcAuthorUrn = "";

  if (isOrgAuthor) {
    effectiveRestAuthorUrn = env.linkedInOrgUrn;
    effectiveUgcAuthorUrn = env.linkedInOrgUrn;
  } else {
    // Personal post: prefer token-detected URNs (detectedAuthor already checks DB saved URN).
    effectiveRestAuthorUrn = detectedAuthor.personUrn || getLinkedInAuthorUrn();
    effectiveUgcAuthorUrn  = detectedAuthor.memberUrn  || getLinkedInUgcAuthorUrn();
  }

  if (!effectiveRestAuthorUrn) {
    throw new Error(
      "Could not resolve LinkedIn author URN. Reconnect LinkedIn via the Connect button " +
      "(ensure the LinkedIn app has 'Sign In with LinkedIn using OpenID Connect' or r_liteprofile scope enabled)."
    );
  }

  // Warn if only alphanumeric (non-numeric) URN available — REST Posts may still reject it.
  if (!detectedAuthor.memberUrn && !isOrgAuthor) {
    console.warn(
      "[LinkedIn] No numeric member URN available. Posts may fail. " +
      "Reconnect LinkedIn with r_liteprofile scope to fix this permanently."
    );
  }

  // 1 – Upload the birthday card image (fallback to text-only post on upload failure)
  let imageUrn = null;
  if (localImagePath) {
    try {
      imageUrn = await uploadImageToLinkedIn(localImagePath, effectiveRestAuthorUrn, accessToken);
    } catch (uploadError) {
      console.warn(
        `[LinkedIn] Image upload failed for ${name}. Falling back to text-only post: ${uploadError.message}`
      );
    }
  }

  // 2 – Create the post
  const postPayload = {
    author:       effectiveRestAuthorUrn,
    commentary,
    visibility:   "PUBLIC",
    distribution: {
      feedDistribution:             "MAIN_FEED",
      targetEntities:               [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState:          "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    postPayload.content = {
      media: {
        id:    imageUrn,
        title: `Happy Birthday ${name}!`,
      },
    };
  }

  const postBody = JSON.stringify(postPayload);

  const postRes = await linkedInRestRequest({
    method: "POST",
    path: "/rest/posts",
    accessToken,
    body: postBody,
    extraHeaders: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postBody),
    },
  });

  if (postRes.status === 201) {
    const liId = postRes.headers["x-restli-id"] || "(id unavailable)";
    const mode = imageUrn ? "with image" : "without image";
    console.log(`[LinkedIn] Birthday post for ${name} published (${mode}) → ${liId}`);
  } else {
    if (postRes.status === 403) {
      if (!imageUrn) {
        try {
          let ugcAuthorUrn = getLinkedInUgcAuthorUrn();

          // If author field is denied, retry with token owner identity from /v2/me.
          if (isAuthorAccessDenied(postRes.body)) {
            const detected = await detectLinkedInAuthorFromToken(accessToken);

            // REST Posts retry uses personUrn (urn:li:person:)
            if (detected.personUrn && detected.personUrn !== effectiveRestAuthorUrn) {
              const retryPostBody = JSON.stringify({ ...postPayload, author: detected.personUrn });
              const retryPostRes = await linkedInRestRequest({
                method: "POST",
                path: "/rest/posts",
                accessToken,
                body: retryPostBody,
                extraHeaders: {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(retryPostBody),
                },
              });

              if (retryPostRes.status === 201) {
                const liId = retryPostRes.headers["x-restli-id"] || "(id unavailable)";
                console.log(
                  `[LinkedIn] Birthday post for ${name} published (author auto-detected from token) → ${liId}`
                );
                return;
              }

              if (retryPostRes.status === 403) {
                throw new Error(
                  `LinkedIn author mismatch. Token owner appears to be ${detected.personUrn}. ` +
                  `Set LINKEDIN_MEMBER_URN=${detected.memberUrn || detected.personUrn} and retry.`
                );
              }
            }

            // UGC fallback uses memberUrn (urn:li:member:)
            if (detected.memberUrn) {
              ugcAuthorUrn = detected.memberUrn;
            }
          }

          const resolvedUgcAuthorUrn = ugcAuthorUrn || effectiveUgcAuthorUrn;
          if (!resolvedUgcAuthorUrn) {
            throw new Error(
              "LinkedIn UGC fallback requires LINKEDIN_MEMBER_URN (urn:li:member:<numeric-id>) or LINKEDIN_ORG_URN for pages"
            );
          }

          const fallback = await postTextToLinkedInUgc({
            authorUrn: resolvedUgcAuthorUrn,
            commentary,
            accessToken,
          });
          console.log(`[LinkedIn] Birthday post for ${name} published (UGC text-only fallback) → ${fallback.id}`);
          return;
        } catch (fallbackErr) {
          throw new Error(fallbackErr.message);
        }
      }

      throw new Error(
        `LinkedIn post request failed (403): ${compactMessage(postRes.body) || "No response body"}. ${buildLinkedInForbiddenHint()}`
      );
    }

    throw new Error(`LinkedIn post request failed (${postRes.status}): ${postRes.body}`);
  }
}
