import { StatusCodes } from "http-status-codes";
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const MOBILE_DIR = path.join(env.uploadsDir, "mobile");
const VERSION_FILE = path.join(MOBILE_DIR, "version.json");

const ensureMobileDir = () => {
  if (!fs.existsSync(MOBILE_DIR)) {
    fs.mkdirSync(MOBILE_DIR, { recursive: true });
  }
};

// GET /api/mobile/version
export const getMobileVersion = (_req, res) => {
  ensureMobileDir();

  if (!fs.existsSync(VERSION_FILE)) {
    return res.status(StatusCodes.OK).json({ version: null });
  }

  const data = JSON.parse(fs.readFileSync(VERSION_FILE, "utf-8"));
  res.status(StatusCodes.OK).json(data);
};

// POST /api/mobile/upload  (admin only)
export const uploadMobileApk = (req, res) => {
  if (!req.file) {
    throw new AppError("APK file is required", StatusCodes.BAD_REQUEST);
  }

  const { version, buildNumber, mandatory, releaseNotes } = req.body;

  if (!version) {
    throw new AppError("version is required", StatusCodes.BAD_REQUEST);
  }

  // Remove old APK files to save space (keep only latest)
  if (fs.existsSync(VERSION_FILE)) {
    const old = JSON.parse(fs.readFileSync(VERSION_FILE, "utf-8"));
    const oldApk = path.join(MOBILE_DIR, old.apkFilename);
    if (old.apkFilename && fs.existsSync(oldApk)) {
      fs.unlinkSync(oldApk);
    }
  }

  const metadata = {
    version,
    buildNumber: Number(buildNumber) || 1,
    mandatory: mandatory === "true" || mandatory === true,
    releaseNotes: releaseNotes || "",
    apkFilename: req.file.filename,
    publishedAt: new Date().toISOString(),
  };

  fs.writeFileSync(VERSION_FILE, JSON.stringify(metadata, null, 2));

  res.status(StatusCodes.OK).json({ message: "APK uploaded successfully", ...metadata });
};

// GET /api/mobile/download
export const downloadMobileApk = (_req, res) => {
  ensureMobileDir();

  if (!fs.existsSync(VERSION_FILE)) {
    throw new AppError("No APK available", StatusCodes.NOT_FOUND);
  }

  const { apkFilename } = JSON.parse(fs.readFileSync(VERSION_FILE, "utf-8"));

  if (!apkFilename) {
    throw new AppError("No APK available", StatusCodes.NOT_FOUND);
  }

  const apkPath = path.join(MOBILE_DIR, apkFilename);

  if (!fs.existsSync(apkPath)) {
    throw new AppError("APK file not found on server", StatusCodes.NOT_FOUND);
  }

  res.download(apkPath, apkFilename);
};
