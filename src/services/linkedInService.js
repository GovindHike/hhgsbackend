import https from "https";
import fs from "fs";
import { env } from "../config/env.js";

const LI_HOST = "api.linkedin.com";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Headers common to every LinkedIn REST request. */
function baseHeaders() {
  return {
    Authorization: `Bearer ${env.linkedInAccessToken}`,
    "LinkedIn-Version": env.linkedInApiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
  };
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
 * Returns the image URN (e.g. "urn:li:image:…") on success, or null on failure.
 *
 * Env vars required:
 *   LINKEDIN_ACCESS_TOKEN  – OAuth2 bearer token with w_organization_social scope
 *   LINKEDIN_ORG_URN       – e.g. "urn:li:organization:123456789"
 */
async function uploadImageToLinkedIn(localImagePath) {
  const imageBuffer = fs.readFileSync(localImagePath);

  // ── Step 1: Initialise the upload ────────────────────────────────────────
  const initBody = JSON.stringify({
    initializeUploadRequest: { owner: env.linkedInOrgUrn },
  });

  const initRes = await httpsRequest(
    {
      hostname: LI_HOST,
      path:     "/rest/images?action=initializeUpload",
      method:   "POST",
      headers: {
        ...baseHeaders(),
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(initBody),
      },
    },
    initBody
  );

  if (initRes.status !== 200) {
    console.error("[LinkedIn] Image init failed:", initRes.status, initRes.body);
    return null;
  }

  let initData;
  try {
    initData = JSON.parse(initRes.body);
  } catch {
    console.error("[LinkedIn] Could not parse image init response");
    return null;
  }

  const imageUrn     = initData?.value?.image;
  const instructions = initData?.value?.uploadInstructions || [];

  if (!imageUrn || instructions.length === 0) {
    console.error("[LinkedIn] Missing image URN or upload instructions:", initRes.body);
    return null;
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
            Authorization:         `Bearer ${env.linkedInAccessToken}`,
            "LinkedIn-Version":    env.linkedInApiVersion,
            "Content-Type":        "application/octet-stream",
            "Content-Length":      chunk.length,
          },
        },
        (res) => {
          res.resume();
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Image PUT status ${res.statusCode}`));
          }
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
 * Post a personalised birthday card with caption to the company LinkedIn page.
 *
 * This function is intentionally non-blocking — the caller should NOT await it.
 * Any error is caught internally so it can never crash the in-app birthday flow.
 *
 * LinkedIn requirements:
 *   • A LinkedIn developer app with Community Management API access approved.
 *   • An OAuth2 access token (w_organization_social scope) for a member who
 *     has an ADMINISTRATOR company-page role.
 *   • LINKEDIN_ORG_URN set to your company's organization URN
 *     (e.g. "urn:li:organization:123456789").
 *
 * @param {object} p
 * @param {string} p.name            Employee full name
 * @param {string} p.role            Employee designation
 * @param {string} p.commentary      Post caption text
 * @param {string} p.localImagePath  Absolute path to the generated birthday card PNG
 */
export async function postBirthdayToLinkedIn({ name, role, commentary, localImagePath }) {
  if (!env.linkedInEnabled) return;

  if (!env.linkedInAccessToken || !env.linkedInOrgUrn) {
    console.warn("[LinkedIn] Skipping: LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORG_URN not set");
    return;
  }

  try {
    // 1 – Upload the birthday card image
    const imageUrn = await uploadImageToLinkedIn(localImagePath);
    if (!imageUrn) return;

    // 2 – Create the company-page post
    const postBody = JSON.stringify({
      author:       env.linkedInOrgUrn,
      commentary,
      visibility:   "PUBLIC",
      distribution: {
        feedDistribution:             "MAIN_FEED",
        targetEntities:               [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          id:    imageUrn,
          title: `Happy Birthday ${name}!`,
        },
      },
      lifecycleState:          "PUBLISHED",
      isReshareDisabledByAuthor: false,
    });

    const postRes = await httpsRequest(
      {
        hostname: LI_HOST,
        path:     "/rest/posts",
        method:   "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(postBody),
        },
      },
      postBody
    );

    if (postRes.status === 201) {
      const liId = postRes.headers["x-restli-id"] || "(id unavailable)";
      console.log(`[LinkedIn] Birthday post for ${name} published → ${liId}`);
    } else {
      console.error(`[LinkedIn] Post creation failed (${postRes.status}):`, postRes.body);
    }
  } catch (err) {
    console.error("[LinkedIn] Unexpected error:", err.message);
  }
}
