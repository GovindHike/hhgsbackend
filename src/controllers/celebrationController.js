import path from "path";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env.js";
import { Announcement } from "../models/Announcement.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { generateBirthdayCard, generateAnniversaryCard } from "../services/birthdayCardService.js";
import { postBirthdayToLinkedIn } from "../services/linkedInService.js";
import { createNotification } from "../services/notificationService.js";
import { runCelebrationAnnouncementsForDate } from "../jobs/celebrationJob.js";

const CELEBRATION_KEY = "celebration_templates";

const DEFAULT_CONFIG = {
  birthday: {
    titleTemplate: "Happy Birthday {{name}}! 🎂",
    contentTemplate:
      "Wishing you a fantastic birthday, {{name}}!\n\n{{quote}}\n\nHave a wonderful year ahead.",
    defaultQuote: "May your day be filled with happiness and success.",
    imageTemplate: "{{photo}}"
  },
  anniversary: {
    titleTemplate: "Happy Work Anniversary {{name}}! 🎉",
    contentTemplate:
      "Congratulations {{name}} on completing {{years}} year(s) with us!\n\n{{quote}}\n\nThank you for your contribution.",
    defaultQuote: "Your dedication continues to inspire the team.",
    imageTemplate: "{{photo}}"
  }
};

const normalizeSection = (section = {}) => ({
  titleTemplate: String(section.titleTemplate || "").trim(),
  contentTemplate: String(section.contentTemplate || "").trim(),
  defaultQuote: String(section.defaultQuote || "").trim(),
  imageTemplate: String(section.imageTemplate || "").trim()
});

const normalizeConfig = (value = {}) => ({
  birthday: normalizeSection(value.birthday),
  anniversary: normalizeSection(value.anniversary)
});

const mergeWithDefaults = (value = {}) => ({
  birthday: { ...DEFAULT_CONFIG.birthday, ...(value.birthday || {}) },
  anniversary: { ...DEFAULT_CONFIG.anniversary, ...(value.anniversary || {}) }
});

const renderTpl = (template, values) =>
  String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) =>
    values[k] != null ? String(values[k]) : ""
  );

const getSystemAuthor = async () => {
  try {
    return await User.findOne({ email: env.systemAuthorEmail }).select("_id").lean();
  } catch {
    return null;
  }
};

const getRequestBaseUrl = (req) => `${req.protocol}://${req.get("host")}`;

export const getCelebrationTemplates = async (_req, res) => {
  const setting = await Setting.findOne({ key: CELEBRATION_KEY }).lean();
  const config = mergeWithDefaults(normalizeConfig(setting?.templates || {}));

  res.status(StatusCodes.OK).json({
    key: CELEBRATION_KEY,
    templates: config
  });
};

export const updateCelebrationTemplates = async (req, res) => {
  const normalized = normalizeConfig(req.body.templates || {});
  const templates = mergeWithDefaults(normalized);

  const setting = await Setting.findOneAndUpdate(
    { key: CELEBRATION_KEY },
    { key: CELEBRATION_KEY, templates },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  res.status(StatusCodes.OK).json({
    message: "Celebration templates updated successfully",
    key: CELEBRATION_KEY,
    templates: setting.templates
  });
};

export const triggerCelebrations = async (req, res) => {
  const dateInput = req.body?.date;
  const runDate = dateInput ? new Date(dateInput) : new Date();

  if (Number.isNaN(runDate.getTime())) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Invalid date" });
  }

  const result = await runCelebrationAnnouncementsForDate(runDate);
  return res.status(StatusCodes.OK).json({
    message: "Celebration announcements processed",
    ...result
  });
};

export const getLinkedInStatus = (_req, res) => {
  res.status(StatusCodes.OK).json({
    enabled:    env.linkedInEnabled,
    configured: Boolean(env.linkedInAccessToken && env.linkedInOrgUrn),
    orgUrn:     env.linkedInOrgUrn ? `${env.linkedInOrgUrn.slice(0, 32)}…` : "",
    apiVersion: env.linkedInApiVersion
  });
};

/**
 * Generate a birthday card for a specific user and return its public URL.
 * The admin uses this to preview the exact image before posting.
 */
export const previewCard = async (req, res) => {
  const { userId } = req.params;
  const type       = String(req.query.type || "birthday");

  const user = await User.findById(userId).select("name role profilePhotoUrl joiningDate").lean();
  if (!user) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }

  let card;

  if (type === "anniversary") {
    if (!user.joiningDate) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Selected user has no joining date" });
    }

    card = await generateAnniversaryCard({
      name:            user.name,
      role:            user.role || "",
      profilePhotoUrl: user.profilePhotoUrl || "",
      joiningDate:     user.joiningDate,
      outputDir:       path.join(process.cwd(), "uploads", "announcements"),
      baseUrl:         getRequestBaseUrl(req)
    });
  } else {
    card = await generateBirthdayCard({
      name:            user.name,
      role:            user.role || "",
      profilePhotoUrl: user.profilePhotoUrl || "",
      outputDir:       path.join(process.cwd(), "uploads", "announcements"),
      baseUrl:         getRequestBaseUrl(req)
    });
  }

  if (!card) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Card generation failed" });
  }

  return res.status(StatusCodes.OK).json({
    url:             card.url,
    name:            user.name,
    role:            user.role || "",
    profilePhotoUrl: user.profilePhotoUrl || "",
    type
  });
};

/**
 * Manually create and publish a birthday (or anniversary) announcement for a
 * specific employee — sends in-app notifications and fires LinkedIn if active.
 */
export const manualPost = async (req, res) => {
  const { userId, type = "birthday" } = req.body;
  const source = type === "anniversary" ? "work_anniversary" : "birthday";

  const user = await User.findById(userId).select("_id name role profilePhotoUrl joiningDate").lean();
  if (!user) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }

  const setting   = await Setting.findOne({ key: CELEBRATION_KEY }).lean();
  const templates = mergeWithDefaults(setting?.templates || {});
  const template  = templates[type] || templates.birthday;

  const values = {
    name:  user.name,
    quote: template.defaultQuote || "",
    years: "",
    photo: user.profilePhotoUrl || ""
  };

  const title   = renderTpl(template.titleTemplate,   values).trim();
  const content = renderTpl(template.contentTemplate, values).trim();

  if (!content) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Template content is empty — please save a content template first." });
  }

  let media              = [];
  let generatedLocalPath = null;

  const baseUrl = getRequestBaseUrl(req);

  if (source === "birthday" || source === "work_anniversary") {
    const card = source === "birthday"
      ? await generateBirthdayCard({
          name:            user.name,
          role:            user.role || "",
          profilePhotoUrl: user.profilePhotoUrl || "",
          outputDir:       path.join(process.cwd(), "uploads", "announcements"),
          baseUrl:         baseUrl
        })
      : user.joiningDate
        ? await generateAnniversaryCard({
            name:            user.name,
            role:            user.role || "",
            profilePhotoUrl: user.profilePhotoUrl || "",
            joiningDate:     user.joiningDate,
            outputDir:       path.join(process.cwd(), "uploads", "announcements"),
            baseUrl:         baseUrl
          })
        : null;

    if (card) {
      media              = [{ type: "image", url: card.url }];
      generatedLocalPath = card.localPath;
    } else if (type === "anniversary") {
      const imageUrl = renderTpl(template.imageTemplate, values).trim();
      if (imageUrl && !imageUrl.includes("{{")) {
        media = [{ type: "image", url: imageUrl }];
      }
    }
  }

  const systemUser = await getSystemAuthor();
  const author     = systemUser || user;

  const announcement = await Announcement.create({
    title,
    content,
    media,
    createdBy: author._id
  });

  const allUsers = await User.find({ isActive: true }).select("_id").lean();
  await createNotification({
    recipients:  allUsers.map((u) => u._id),
    title:       title || "New Announcement",
    message:     content.slice(0, 160),
    type:        "announcement",
    entityType:  "announcement",
    entityId:    announcement._id,
    redirectUrl: "/announcements",
    createdBy:   author._id
  });

  if (source === "birthday" && generatedLocalPath) {
    const commentary =
      `🎂 Happy Birthday, ${user.name}!\n\n` +
      `Wishing ${user.name}${user.role ? `, our ${user.role},` : ""} a joyful birthday!\n\n` +
      `#HappyBirthday #TeamCelebration #HikeHealthGS`;
    postBirthdayToLinkedIn({
      name:           user.name,
      role:           user.role || "",
      commentary,
      localImagePath: generatedLocalPath
    }).catch((err) => console.error("[LinkedIn] fire-and-forget error:", err.message));
  }

  return res.status(StatusCodes.CREATED).json({
    message:      "Posted successfully",
    announcement: { _id: announcement._id, title: announcement.title }
  });
};
