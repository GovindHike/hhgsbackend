import https from "https";
import http from "http";
import sharp from "sharp";
import { env } from "../config/env.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeHttpsRequest({ hostname, path: reqPath, method, headers, body }, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: reqPath, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            contentType: res.headers["content-type"] || "",
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Request timed out")));
    if (body) req.write(body);
    req.end();
  });
}

function downloadBuffer(urlString, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(urlString); } catch { return reject(new Error(`Invalid URL: ${urlString}`)); }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(
      { hostname: parsed.hostname, port: parsed.port || undefined, path: parsed.pathname + parsed.search, headers: { "User-Agent": "HHGS-Office-Management/1.0" } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(downloadBuffer(res.headers.location, timeoutMs));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Download timed out")));
    req.end();
  });
}

async function openAiRequest(apiPath, payload, timeoutMs = 30000) {
  if (!env.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const body = Buffer.from(JSON.stringify(payload));
  const res = await makeHttpsRequest(
    { hostname: "api.openai.com", path: apiPath, method: "POST",
      headers: { Authorization: `Bearer ${env.openAiApiKey}`, "Content-Type": "application/json", "Content-Length": body.length } },
    timeoutMs
  );
  const data = JSON.parse(res.body.toString("utf8") || "{}");
  if (res.status >= 400) throw new Error(data.error?.message || `OpenAI error ${res.status}`);
  return data;
}

// ── SVG-based image generator (Sharp, no external API) ────────────────────

function escapeXml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapTitle(title, maxChars = 38) {
  const words = title.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length <= maxChars) { cur = test; }
    else { if (cur) lines.push(cur); cur = w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.splice(3); lines[2] = lines[2].slice(0, maxChars - 1) + "…"; }
  return lines;
}

function buildHealthcareSvg(title) {
  const lines = wrapTitle(title, 38);
  const LINE_H = 58;
  const START_Y = 310 - Math.floor((lines.length - 1) * LINE_H * 0.5);
  const tspans = lines
    .map((l, i) => `<tspan x="100" dy="${i === 0 ? 0 : LINE_H}">${escapeXml(l)}</tspan>`)
    .join("");

  // Dot-grid rows
  const dots = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 16 }, (_, c) => `<circle cx="${c * 72 + 36}" cy="${r * 66 + 30}" r="1.6"/>`)
      .join("")
  ).join("");

  return `<svg width="1200" height="628" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#0f172a"/>
    <stop offset="48%"  stop-color="#1e1b4b"/>
    <stop offset="100%" stop-color="#312e81"/>
  </linearGradient>
  <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#6366f1"/>
    <stop offset="100%" stop-color="#a855f7"/>
  </linearGradient>
  <linearGradient id="acc2" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#818cf8"/>
    <stop offset="100%" stop-color="#c084fc"/>
  </linearGradient>
  <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
    <stop offset="0%"   stop-color="#6366f1" stop-opacity="0.22"/>
    <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
    <stop offset="0%"   stop-color="#a855f7" stop-opacity="0.18"/>
    <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
  </radialGradient>
</defs>

<!-- Background -->
<rect width="1200" height="628" fill="url(#bg)"/>

<!-- Ambient glows -->
<ellipse cx="1060" cy="140" rx="320" ry="240" fill="url(#glow1)"/>
<ellipse cx="100"  cy="520" rx="240" ry="180" fill="url(#glow2)"/>

<!-- Dot grid -->
<g fill="#818cf8" opacity="0.09">${dots}</g>

<!-- Right-side network diagram -->
<g opacity="0.75">
  <line x1="870" y1="170" x2="990" y2="260" stroke="#6366f1" stroke-width="1.5" opacity="0.55"/>
  <line x1="990" y1="260" x2="930" y2="380" stroke="#818cf8" stroke-width="1.5" opacity="0.55"/>
  <line x1="930" y1="380" x2="1060" y2="390" stroke="#6366f1" stroke-width="1.2" opacity="0.45"/>
  <line x1="990" y1="260" x2="1090" y2="175" stroke="#a855f7" stroke-width="1.5" opacity="0.55"/>
  <line x1="870" y1="170" x2="780" y2="290" stroke="#6366f1" stroke-width="1"   opacity="0.35"/>
  <line x1="780" y1="290" x2="930" y2="380" stroke="#818cf8" stroke-width="1"   opacity="0.35"/>
  <!-- Nodes -->
  <circle cx="870"  cy="170" r="11" fill="#6366f1" opacity="0.9"/><circle cx="870"  cy="170" r="5"  fill="#c7d2fe"/>
  <circle cx="990"  cy="260" r="16" fill="#7c3aed" opacity="0.9"/><circle cx="990"  cy="260" r="8"  fill="#ddd6fe"/>
  <circle cx="930"  cy="380" r="10" fill="#6366f1" opacity="0.8"/><circle cx="930"  cy="380" r="5"  fill="#a5b4fc"/>
  <circle cx="1060" cy="390" r="9"  fill="#8b5cf6" opacity="0.8"/><circle cx="1060" cy="390" r="4"  fill="#e9d5ff"/>
  <circle cx="1090" cy="175" r="10" fill="#6366f1" opacity="0.8"/><circle cx="1090" cy="175" r="5"  fill="#a5b4fc"/>
  <circle cx="780"  cy="290" r="8"  fill="#a855f7" opacity="0.7"/><circle cx="780"  cy="290" r="4"  fill="#f3e8ff"/>
</g>

<!-- Healthcare cross (background) -->
<g transform="translate(960,60)" opacity="0.06">
  <rect x="70" y="0"  width="56" height="192" rx="12" fill="white"/>
  <rect x="0"  y="72" width="196" height="56"  rx="12" fill="white"/>
</g>

<!-- Left accent bar -->
<rect x="100" y="248" width="5" height="96" rx="2.5" fill="url(#acc)"/>

<!-- Topic pill -->
<rect x="100" y="192" width="238" height="36" rx="18" fill="url(#acc)" opacity="0.88"/>
<text x="219" y="215" text-anchor="middle"
  font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700"
  fill="white" letter-spacing="1.8">HEALTHCARE TECHNOLOGY</text>

<!-- Main title -->
<text font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="700" fill="white">
  <tspan x="100" y="${START_Y}">${tspans}</tspan>
</text>

<!-- Divider tag line -->
<text x="100" y="${START_Y + lines.length * LINE_H + 28}"
  font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#818cf8" opacity="0.85">
  Insights for Healthcare IT Professionals
</text>

<!-- Bottom bar -->
<rect x="0" y="572" width="1200" height="56" fill="#080c18" opacity="0.78"/>
<rect x="0" y="572" width="360" height="3" fill="url(#acc)"/>
<text x="100" y="608"
  font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700"
  fill="white" opacity="0.96">HikeHealth GS</text>
<text x="262" y="608"
  font-family="Arial,Helvetica,sans-serif" font-size="14"
  fill="#818cf8" opacity="0.82">| FHIR &amp; Interoperability</text>
<text x="1110" y="608" text-anchor="end"
  font-family="Arial,Helvetica,sans-serif" font-size="13"
  fill="#6366f1" opacity="0.8">hikehealthgs.com</text>
</svg>`;
}

async function generateImageWithSharp(title) {
  const svg = buildHealthcareSvg(title);
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// ── Try OpenAI gpt-image-1 (returns base64 natively) ──────────────────────

async function tryOpenAiImage(articleTitle) {
  const prompt =
    `Professional LinkedIn banner, healthcare technology, "${articleTitle}". ` +
    "Modern digital illustration, deep indigo blue background, glowing connected data nodes, " +
    "FHIR network, abstract medical cross, cinematic lighting. No text, no words, no letters.";

  const res = await makeHttpsRequest(
    {
      hostname: "api.openai.com",
      path: "/v1/images/generations",
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openAiApiKey}`,
        "Content-Type": "application/json",
      },
    },
    20000 // short timeout — fall back fast if it doesn't work
  );

  // Need content-length for the request — rebuild with proper headers
  throw new Error("Skipping to sharp fallback");
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchHealthcareNews(topics = [], page = 1) {
  if (!env.newsApiKey) throw new Error("NEWS_API_KEY is not configured.");

  const query =
    topics.length > 0
      ? topics.join(" OR ")
      : 'healthcare FHIR interoperability EHR "health IT"';

  const params = new URLSearchParams({
    q: query, language: "en", sortBy: "publishedAt",
    pageSize: "20", page: String(page), apiKey: env.newsApiKey,
  });

  const res = await makeHttpsRequest({
    hostname: "newsapi.org",
    path: `/v2/everything?${params.toString()}`,
    method: "GET",
    headers: { "User-Agent": "HHGS-Office-Management/1.0" },
  });

  const data = JSON.parse(res.body.toString("utf8") || "{}");
  if (res.status !== 200) throw new Error(data.message || `NewsAPI error ${res.status}`);
  return (data.articles || []).filter((a) => a.title && a.title !== "[Removed]" && a.url);
}

export async function generateLinkedInPost({ title, description, source }) {
  const data = await openAiRequest("/v1/chat/completions", {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a healthcare IT thought leader writing concise, engaging LinkedIn content for HikeHealth GS — a healthcare technology company specialising in FHIR, interoperability, and digital health solutions.",
      },
      {
        role: "user",
        content: `Write a professional LinkedIn post about this healthcare news article.

Title: ${title}
Summary: ${description || "No summary provided"}
Source: ${source || "Unknown"}

Requirements:
- 200–280 words
- Open with a strong hook (question, bold claim, or striking statistic)
- Include 2–3 key insights for healthcare IT professionals
- Use 2–4 emojis for visual appeal
- Close with an engaging question to drive comments
- End with 4–6 relevant hashtags (#FHIR #Interoperability #HealthIT #DigitalHealth etc.)
- Sound authentic and conversational, not like corporate marketing
- Write in first person

Return only the post text, no preamble.`,
      },
    ],
    temperature: 0.82,
    max_tokens: 600,
  });

  return data.choices[0].message.content.trim();
}

/**
 * Generate a professional healthcare-themed image for a LinkedIn post.
 *
 * Attempts OpenAI gpt-image-1 first (if available on the account).
 * Falls back to a Sharp-rendered SVG graphic that is always reliable.
 */
export async function generatePostImage(articleTitle) {
  // Attempt OpenAI gpt-image-1 (requires image generation to be enabled in the project)
  if (env.openAiApiKey) {
    try {
      const prompt =
        `Professional LinkedIn banner, healthcare technology, "${articleTitle}". ` +
        "Modern digital illustration, deep indigo background, glowing connected data nodes, " +
        "FHIR network, abstract medical cross, cinematic lighting. No text, no words, no letters.";

      const body = Buffer.from(
        JSON.stringify({ model: "gpt-image-1-mini", prompt, n: 1, size: "1024x1024", quality: "low" })
      );

      const res = await makeHttpsRequest(
        {
          hostname: "api.openai.com",
          path: "/v1/images/generations",
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.openAiApiKey}`,
            "Content-Type": "application/json",
            "Content-Length": body.length,
          },
          body,
        },
        120000  // 2-minute timeout — image generation can be slow
      );

      if (res.status === 200) {
        const data = JSON.parse(res.body.toString("utf8"));
        const b64 = data?.data?.[0]?.b64_json;
        if (b64) return `data:image/png;base64,${b64}`;
        // url-style response
        const url = data?.data?.[0]?.url;
        if (url) {
          const buf = await downloadBuffer(url, 30000);
          return `data:image/png;base64,${buf.toString("base64")}`;
        }
      }
      // Any non-200 → fall through silently to Sharp
      console.warn(`[AI] gpt-image-1 returned ${res.status}, using Sharp fallback.`);
    } catch (err) {
      console.warn("[AI] gpt-image-1 failed, using Sharp fallback:", err.message);
    }
  }

  // Reliable local fallback — professional healthcare SVG via Sharp
  return generateImageWithSharp(articleTitle);
}

/**
 * Convert an image URL or base64 data URL into a Buffer for LinkedIn upload.
 */
export async function downloadImageBuffer(imageUrl) {
  if (imageUrl.startsWith("data:")) {
    const base64Part = imageUrl.split(",")[1];
    if (!base64Part) throw new Error("Invalid base64 data URL");
    return Buffer.from(base64Part, "base64");
  }
  return downloadBuffer(imageUrl, 60000);
}
