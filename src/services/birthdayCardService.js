import sharp from "sharp";
import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Absolute path to the template PNG placed in backend/src/
const TEMPLATE_PATH = path.join(__dirname, "..", "Birth Templates.png");

// ── Layout ratios calibrated to the HHGS birthday template ─────────────────
//
//  Template is 1080 × 1080 px (standard LinkedIn / Instagram square).
//
//  Photo circle — the large blue placeholder near the top-centre:
//    centre-x ≈ 50 %   of image width   → 540 px
//    centre-y ≈ 31.9 % of image height  → 344 px
//    radius   ≈ 17.1 % of image width   → 185 px
//
//  Empty white zone between the "Birthday" divider and the quote band:
//    starts ≈ 67 % (724 px) — ends ≈ 82 % (885 px)
//
//  Name text — centred in the upper-half of that white zone:
//    y baseline ≈ 74.5 % of image height → 804 px
//
//  Role text — below the name, still in the white zone:
//    y baseline ≈ 79.0 % of image height → 853 px
//
const LAYOUT = {
  photo: { cxRatio: 0.50, cyRatio: 0.319, rRatio: 0.171 },
  name:  { yRatio: 0.745 },
  role:  { yRatio: 0.790 },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load an image as a Buffer.
 *  – Paths containing "/uploads/" are resolved directly from the local
 *    filesystem (same server, no extra HTTP round-trip).
 *  – All other URLs are fetched via HTTP/HTTPS with a 5-second timeout.
 * Returns null when the URL is absent, the file does not exist, or the fetch
 * fails for any reason.
 */
async function loadImageBuffer(url) {
  if (!url) return null;

  try {
    // Try local filesystem resolution first
    const marker = "/uploads/";
    if (url.includes(marker)) {
      const localPath = path.join(process.cwd(), url.slice(url.indexOf(marker)));
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath);
      }
    }

    // Fall back to HTTP/HTTPS
    return await new Promise((resolve) => {
      const get = url.startsWith("https://") ? https.get : http.get;
      const req = get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end",  () => resolve(Buffer.concat(chunks)));
        res.on("error", () => resolve(null));
      });
      req.on("error", () => resolve(null));
    });
  } catch {
    return null;
  }
}

/** SVG circle mask — composited with blend="dest-in" to crop a photo into a circle. */
function circleMaskSvg(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="white"/>` +
    `</svg>`
  );
}

/** Escape special XML characters in text content. */
const xmlEsc = (s) =>
  String(s).replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c])
  );

/**
 * Build an SVG overlay that draws the employee name (bold, dark) and role
 * (regular, brand-green) centred on the image.
 */
function buildTextOverlaySvg({ width, height, name, role, nameY, roleY }) {
  const nameFontSize = Math.round(width * 0.044); // ≈ 47 px on 1080 canvas
  const roleFontSize = Math.round(width * 0.032); // ≈ 34 px
  const cx = width / 2;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="${cx}" y="${nameY}" ` +
      `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
      `font-size="${nameFontSize}" font-weight="bold" ` +
      `fill="#1a1a1a" text-anchor="middle">${xmlEsc(name)}</text>` +
    `<text x="${cx}" y="${roleY}" ` +
      `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
      `font-size="${roleFontSize}" font-weight="normal" ` +
      `fill="#1a5c31" text-anchor="middle">${xmlEsc(role)}</text>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose a personalised birthday card by placing the employee's circular
 * profile photo, name, and role onto the HHGS birthday template.
 *
 * @param {object} p
 * @param {string}  p.name             Employee full name
 * @param {string}  p.role             Employee designation / role title
 * @param {string}  [p.profilePhotoUrl] Full URL of the employee profile photo
 * @param {string}  p.outputDir        Directory to write the generated image
 * @param {string}  p.baseUrl          Backend origin, e.g. "http://localhost:5000"
 *
 * @returns {Promise<{url: string, localPath: string} | null>}
 *   Both the public-facing URL and the absolute local path of the generated
 *   PNG, or null if generation fails (birthday announcement still proceeds).
 */
export async function generateBirthdayCard({ name, role, profilePhotoUrl, outputDir, baseUrl }) {
  try {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      console.error("[birthdayCard] Template PNG not found at:", TEMPLATE_PATH);
      return null;
    }

    // ── Load template and measure dimensions ──────────────────────────────
    const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
    const { width: W, height: H } = await sharp(templateBuffer).metadata();

    // Compute pixel positions from layout ratios
    const photoCX   = Math.round(W * LAYOUT.photo.cxRatio);
    const photoCY   = Math.round(H * LAYOUT.photo.cyRatio);
    const photoR    = Math.round(W * LAYOUT.photo.rRatio);
    const photoDiam = photoR * 2;
    const nameY     = Math.round(H * LAYOUT.name.yRatio);
    const roleY     = Math.round(H * LAYOUT.role.yRatio);

    const composites = [];

    // ── Employee profile photo (circular crop) ────────────────────────────
    const photoBuffer = await loadImageBuffer(profilePhotoUrl);
    if (photoBuffer) {
      const maskedPhoto = await sharp(photoBuffer)
        .resize(photoDiam, photoDiam, { fit: "cover", position: "centre" })
        .composite([{ input: circleMaskSvg(photoDiam), blend: "dest-in" }])
        .png()
        .toBuffer();

      composites.push({
        input: maskedPhoto,
        left:  photoCX - photoR,
        top:   photoCY - photoR,
      });
    }

    // ── Name and role text ─────────────────────────────────────────────────
    composites.push({
      input: buildTextOverlaySvg({ width: W, height: H, name, role, nameY, roleY }),
      left: 0,
      top:  0,
    });

    // ── Render to file ─────────────────────────────────────────────────────
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename  = `birthday-${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const localPath = path.join(outputDir, filename);

    await sharp(templateBuffer).composite(composites).png().toFile(localPath);

    return { url: `${baseUrl}/uploads/announcements/${filename}`, localPath };
  } catch (err) {
    console.error("[birthdayCard] Generation failed:", err.message);
    return null;
  }
}
