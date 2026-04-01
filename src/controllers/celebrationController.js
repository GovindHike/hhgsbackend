import { StatusCodes } from "http-status-codes";
import { Setting } from "../models/Setting.js";
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
