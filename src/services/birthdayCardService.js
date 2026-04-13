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
const ANNIVERSARY_TEMPLATE_PATH = path.join(__dirname, "..", "Work Anniversary.png");

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
  photo: {
    cxRatio: 0.5,
    cyRatio: 0.343,
    outerRadiusRatio: 0.163,
    insetRatio: 0.012,
  },
  name:  { yRatio: 0.769 },
  role:  { yRatio: 0.819 },
};

const ANNIVERSARY_LAYOUT = {
  photo: {
    leftRatio: 0.399,
    topRatio: 0.418,
    widthRatio: 0.216,
    heightRatio: 0.244,
    radiusRatio: 0.06,
  },
  band: {
    centerXRatio: 0.505,
    topRatio: 0.67,
    widthRatio: 0.33,
    heightRatio: 0.07,
    radiusRatio: 0.015,
    paddingRatio: 0.015,
  },
  ordinal: {
    xRatio: 0.625,
    yRatio: 0.194,
    fontSizeRatio: 0.022,
    color: "#2b627d",
  },
  quote: {
    line1YRatio: 0.835,
    line2YRatio: 0.875,
    maxWidthRatio: 0.72,
  },
};

const ordinalSuffix = (value) => {
  const number = Math.max(1, Math.floor(Number(value) || 1));
  const tens = number % 100;
  if (tens >= 11 && tens <= 13) return `${number}th`;
  switch (number % 10) {
    case 1: return `${number}st`;
    case 2: return `${number}nd`;
    case 3: return `${number}rd`;
    default: return `${number}th`;
  }
};

const roundedRectMaskSvg = (width, height, radius) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>` +
    `</svg>`
  );

const compactText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const toTemplateName = (value) => compactText(value).toLocaleUpperCase();

const getFittedFontSize = ({ text, maxWidth, maxFontSize, minFontSize, widthFactor }) => {
  const safeText = compactText(text);
  if (!safeText) return minFontSize;

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const estimatedWidth = safeText.length * fontSize * widthFactor;
    if (estimatedWidth <= maxWidth) return fontSize;
  }

  return minFontSize;
};

const estimateTextWidth = (text, fontSize, widthFactor) => compactText(text).length * fontSize * widthFactor;

const splitTextIntoBalancedLines = (text) => {
  const words = compactText(text).split(" ").filter(Boolean);
  if (words.length < 2) return [compactText(text)];

  let bestLines = [compactText(text)];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 1; index < words.length; index += 1) {
    const firstLine = words.slice(0, index).join(" ");
    const secondLine = words.slice(index).join(" ");
    const score = Math.abs(firstLine.length - secondLine.length);

    if (score < bestScore) {
      bestScore = score;
      bestLines = [firstLine, secondLine];
    }
  }

  return bestLines;
};

const getRoleQuoteTheme = (role) => {
  const roleText = compactText(role).toLowerCase();

  if (/engineer|developer|qa|tester|architect|tech|it/.test(roleText)) {
    return "innovation and problem-solving uplift every milestone";
  }
  if (/manager|lead|head|director|vp|chief|supervisor/.test(roleText)) {
    return "leadership and guidance strengthen the whole team";
  }
  if (/hr|human resource|recruit|talent|people/.test(roleText)) {
    return "people-first support builds a better workplace each day";
  }
  if (/sales|marketing|business|growth|account manager/.test(roleText)) {
    return "customer focus and initiative drive meaningful growth";
  }
  if (/finance|accounts|accountant|audit|compliance/.test(roleText)) {
    return "precision and ownership keep our foundation strong";
  }
  if (/ops|operation|admin|support|coordinator/.test(roleText)) {
    return "consistency and reliability keep everything running smoothly";
  }

  return "dedication and teamwork inspire everyone around you";
};

const getYearQuoteLine = (years) => {
  if (years <= 1) return "A brilliant first year of growth and collaboration.";
  if (years === 2) return "Two years of steady impact and shared success.";
  if (years === 3) return "Three years of commitment, consistency, and excellence.";
  return `${years} years of trust, dedication, and remarkable contribution.`;
};

const buildAnniversaryQuoteLines = (role, years) => {
  const line1 = `Your ${getRoleQuoteTheme(role)}.`;
  const line2 = getYearQuoteLine(years);
  return [line1, line2];
};

const buildAnniversaryTextOverlaySvg = ({ width, height, name, role, years, ordinalText }) => {
  const cx = Math.round(width * ANNIVERSARY_LAYOUT.band.centerXRatio);
  const trimmedName = toTemplateName(name);
  const trimmedRole = compactText(role);
  const quoteLines = buildAnniversaryQuoteLines(role, years);

  const bandWidth = Math.round(width * ANNIVERSARY_LAYOUT.band.widthRatio);
  const defaultBandHeight = Math.round(height * ANNIVERSARY_LAYOUT.band.heightRatio);
  const bandX = Math.round(cx - bandWidth / 2);
  const bandPadding = Math.round(width * ANNIVERSARY_LAYOUT.band.paddingRatio);
  const maxTextWidth = bandWidth - bandPadding * 2;

  let nameLines = [trimmedName];
  let nameFontSize = getFittedFontSize({
    text: trimmedName,
    maxWidth: maxTextWidth,
    maxFontSize: Math.round(width * 0.028),
    minFontSize: Math.round(width * 0.016),
    widthFactor: 0.64,
  });

  if (estimateTextWidth(trimmedName, nameFontSize, 0.64) > maxTextWidth && trimmedName.includes(" ")) {
    nameLines = splitTextIntoBalancedLines(trimmedName);
    nameFontSize = Math.max(
      getFittedFontSize({
        text: nameLines[0],
        maxWidth: maxTextWidth,
        maxFontSize: Math.round(width * 0.024),
        minFontSize: Math.round(width * 0.014),
        widthFactor: 0.64,
      }),
      getFittedFontSize({
        text: nameLines[1],
        maxWidth: maxTextWidth,
        maxFontSize: Math.round(width * 0.024),
        minFontSize: Math.round(width * 0.014),
        widthFactor: 0.64,
      })
    );
  }

  const bandHeight = nameLines.length === 2
    ? Math.max(defaultBandHeight, Math.round(height * 0.09))
    : defaultBandHeight;
  const bandY = Math.round(height * ANNIVERSARY_LAYOUT.band.topRatio);
  const bandRadius = Math.round(width * ANNIVERSARY_LAYOUT.band.radiusRatio);

  const roleFontSize = getFittedFontSize({
    text: trimmedRole,
    maxWidth: maxTextWidth,
    maxFontSize: Math.round(width * 0.020),
    minFontSize: Math.round(width * 0.013),
    widthFactor: 0.58,
  });

  const ordinalX = Math.round(width * ANNIVERSARY_LAYOUT.ordinal.xRatio);
  const ordinalY = Math.round(height * ANNIVERSARY_LAYOUT.ordinal.yRatio);
  const ordinalFontSize = Math.round(width * ANNIVERSARY_LAYOUT.ordinal.fontSizeRatio);

  const quoteMaxWidth = Math.round(width * ANNIVERSARY_LAYOUT.quote.maxWidthRatio);
  const quoteFontSize = Math.min(
    getFittedFontSize({
      text: quoteLines[0],
      maxWidth: quoteMaxWidth,
      maxFontSize: Math.round(width * 0.024),
      minFontSize: Math.round(width * 0.014),
      widthFactor: 0.54,
    }),
    getFittedFontSize({
      text: quoteLines[1],
      maxWidth: quoteMaxWidth,
      maxFontSize: Math.round(width * 0.024),
      minFontSize: Math.round(width * 0.014),
      widthFactor: 0.54,
    })
  );
  const quote1Y = Math.round(height * ANNIVERSARY_LAYOUT.quote.line1YRatio);
  const quote2Y = Math.round(height * ANNIVERSARY_LAYOUT.quote.line2YRatio);

  const nameLineOneY = nameLines.length === 2
    ? bandY + Math.round(bandHeight * 0.32)
    : trimmedRole
      ? bandY + Math.round(bandHeight * 0.46)
      : bandY + Math.round(bandHeight * 0.60);
  const nameLineTwoY = bandY + Math.round(bandHeight * 0.55);
  const roleY = nameLines.length === 2
    ? bandY + Math.round(bandHeight * 0.82)
    : bandY + Math.round(bandHeight * 0.80);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${bandX}" y="${bandY}" width="${bandWidth}" height="${bandHeight}" rx="${bandRadius}" ry="${bandRadius}" fill="#f8be10" opacity="0.96"/>` +
      `<text x="${ordinalX}" y="${ordinalY}" ` +
        `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
        `font-size="${ordinalFontSize}" font-weight="700" fill="${ANNIVERSARY_LAYOUT.ordinal.color}" text-anchor="middle">${xmlEsc(ordinalText)}</text>` +
      (nameLines.length === 2
        ? `<text x="${cx}" y="${nameLineOneY}" ` +
            `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
            `font-size="${nameFontSize}" font-weight="700" fill="#1a1a1a" text-anchor="middle">${xmlEsc(nameLines[0])}</text>` +
          `<text x="${cx}" y="${nameLineTwoY}" ` +
            `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
            `font-size="${nameFontSize}" font-weight="700" fill="#1a1a1a" text-anchor="middle">${xmlEsc(nameLines[1])}</text>`
        : `<text x="${cx}" y="${nameLineOneY}" ` +
            `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
            `font-size="${nameFontSize}" font-weight="700" fill="#1a1a1a" text-anchor="middle">${xmlEsc(trimmedName)}</text>`) +
      (trimmedRole
        ? `<text x="${cx}" y="${roleY}" ` +
            `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
            `font-size="${roleFontSize}" font-weight="500" fill="#1a1a1a" text-anchor="middle">${xmlEsc(trimmedRole)}</text>`
        : "") +
      `<text x="${width / 2}" y="${quote1Y}" ` +
        `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
        `font-size="${quoteFontSize}" font-weight="500" fill="#2a2a2a" text-anchor="middle">${xmlEsc(quoteLines[0])}</text>` +
      `<text x="${width / 2}" y="${quote2Y}" ` +
        `font-family="Arial, Helvetica, DejaVu Sans, sans-serif" ` +
        `font-size="${quoteFontSize}" font-weight="500" fill="#2a2a2a" text-anchor="middle">${xmlEsc(quoteLines[1])}</text>` +
    `</svg>`
  );
}

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
      const relativePath = url.slice(url.indexOf(marker) + 1);
      const localPath = path.join(process.cwd(), relativePath);
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
  const trimmedName = toTemplateName(name);
  const trimmedRole = compactText(role);
  const maxNameWidth = Math.round(width * 0.72);
  const birthdayFontFamily = "'Jost', Arial, Helvetica, sans-serif";
  const birthdayTextColor = "#246C51";
  const nameFontSize = getFittedFontSize({
    text: trimmedName,
    maxWidth: maxNameWidth,
    maxFontSize: Math.round(width * 0.044),
    minFontSize: Math.round(width * 0.026),
    widthFactor: 0.66,
  });
  const roleFontSize = Math.round(width * 0.032); // ≈ 34 px
  const cx = width / 2;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="${cx}" y="${nameY}" ` +
      `font-family="${birthdayFontFamily}" ` +
      `font-size="${nameFontSize}" font-weight="700" ` +
      `fill="${birthdayTextColor}" text-anchor="middle">${xmlEsc(trimmedName)}</text>` +
    `<text x="${cx}" y="${roleY}" ` +
      `font-family="${birthdayFontFamily}" ` +
      `font-size="${roleFontSize}" font-weight="normal" ` +
      `fill="${birthdayTextColor}" text-anchor="middle">${xmlEsc(trimmedRole)}</text>` +
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
    const photoCX = Math.round(W * LAYOUT.photo.cxRatio);
    const photoCY = Math.round(H * LAYOUT.photo.cyRatio);
    const outerPhotoRadius = Math.round(W * LAYOUT.photo.outerRadiusRatio);
    const inset = Math.round(W * LAYOUT.photo.insetRatio);
    const photoR = Math.max(outerPhotoRadius - inset, 1);
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

const getAnniversaryYears = (joiningDate, referenceDate = new Date()) => {
  const joined = new Date(joiningDate);
  if (!joined.getTime()) return 1;

  let years = referenceDate.getFullYear() - joined.getFullYear();
  const anniversaryThisYear = new Date(referenceDate.getFullYear(), joined.getMonth(), joined.getDate());
  if (referenceDate < anniversaryThisYear) years -= 1;
  return Math.max(years, 1);
};

export async function generateAnniversaryCard({ name, role, profilePhotoUrl, joiningDate, outputDir, baseUrl }) {
  try {
    if (!fs.existsSync(ANNIVERSARY_TEMPLATE_PATH)) {
      console.error("[anniversaryCard] Template PNG not found at:", ANNIVERSARY_TEMPLATE_PATH);
      return null;
    }

    const templateBuffer = fs.readFileSync(ANNIVERSARY_TEMPLATE_PATH);
    const { width: W, height: H } = await sharp(templateBuffer).metadata();

    const years = getAnniversaryYears(joiningDate);
    const ordinalText = ordinalSuffix(years);

    const photoWidth = Math.round(W * ANNIVERSARY_LAYOUT.photo.widthRatio);
    const photoHeight = Math.round(H * ANNIVERSARY_LAYOUT.photo.heightRatio);
    const photoLeft = Math.round(W * ANNIVERSARY_LAYOUT.photo.leftRatio);
    const photoTop = Math.round(H * ANNIVERSARY_LAYOUT.photo.topRatio);
    const photoRadius = Math.round(photoWidth * ANNIVERSARY_LAYOUT.photo.radiusRatio);

    const composites = [];
    const photoBuffer = await loadImageBuffer(profilePhotoUrl);
    if (photoBuffer) {
      const maskedPhoto = await sharp(photoBuffer)
        .resize(photoWidth, photoHeight, { fit: "cover", position: "centre" })
        .composite([{ input: roundedRectMaskSvg(photoWidth, photoHeight, photoRadius), blend: "dest-in" }])
        .png()
        .toBuffer();

      composites.push({
        input: maskedPhoto,
        left:  photoLeft,
        top:   photoTop
      });
    }

    composites.push({
      input: buildAnniversaryTextOverlaySvg({
        width: W,
        height: H,
        name,
        role,
        years,
        ordinalText
      }),
      left: 0,
      top:  0
    });

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename  = `anniversary-${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const localPath = path.join(outputDir, filename);

    await sharp(templateBuffer).composite(composites).png().toFile(localPath);

    return { url: `${baseUrl}/uploads/announcements/${filename}`, localPath };
  } catch (err) {
    console.error("[anniversaryCard] Generation failed:", err.message);
    return null;
  }
}
