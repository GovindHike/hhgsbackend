import cron from "node-cron";
import { env } from "../config/env.js";
import { Announcement } from "../models/Announcement.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { createNotification } from "../services/notificationService.js";

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

const dateKeyFromDate = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const sameMonthDay = (a, b) => a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();

const yearsSince = (fromDate, onDate) => {
  let years = onDate.getUTCFullYear() - fromDate.getUTCFullYear();
  const anniversaryThisYear = new Date(Date.UTC(onDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));
  if (onDate < anniversaryThisYear) {
    years -= 1;
  }
  return years;
};

const render = (template, values) =>
  String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    const value = values[key];
    return value == null ? "" : String(value);
  });

const getTemplates = async () => {
  const setting = await Setting.findOne({ key: CELEBRATION_KEY }).lean();
  const saved = setting?.templates || {};

  return {
    birthday: { ...DEFAULT_CONFIG.birthday, ...(saved.birthday || {}) },
    anniversary: { ...DEFAULT_CONFIG.anniversary, ...(saved.anniversary || {}) }
  };
};

const createCelebrationAnnouncement = async ({ source, user, template, onDate }) => {
  const quote = template.defaultQuote || "";
  const years = source === "work_anniversary" ? Math.max(yearsSince(new Date(user.joiningDate), onDate), 0) : "";
  const values = {
    name: user.name,
    quote,
    years,
    photo: user.profilePhotoUrl || ""
  };

  const title = render(template.titleTemplate, values).trim();
  const content = render(template.contentTemplate, values).trim();
  const imageUrl = render(template.imageTemplate, values).trim();

  if (!content) {
    return null;
  }

  const media = imageUrl ? [{ type: "image", url: imageUrl }] : [];
  const todayKey = dateKeyFromDate(onDate);

  try {
    const announcement = await Announcement.create({
      title,
      content,
      media,
      createdBy: user._id,
      autoMeta: {
        source,
        user: user._id,
        dateKey: todayKey
      }
    });

    const allUsers = await User.find({ isActive: true }).select("_id").lean();
    const recipients = allUsers.map((u) => u._id);

    await createNotification({
      recipients,
      title: title || "New Announcement",
      message: content.slice(0, 160),
      type: "announcement",
      entityType: "announcement",
      entityId: announcement._id,
      redirectUrl: "/announcements",
      createdBy: user._id
    });

    return announcement;
  } catch (error) {
    if (error?.code === 11000) {
      return null;
    }
    throw error;
  }
};

export const runCelebrationAnnouncementsForDate = async (onDate = new Date()) => {
  const date = new Date(onDate);
  const templates = await getTemplates();

  const users = await User.find({ isActive: true, $or: [{ dateOfBirth: { $ne: null } }, { joiningDate: { $ne: null } }] })
    .select("_id name dateOfBirth joiningDate profilePhotoUrl")
    .lean();

  let birthdaysPosted = 0;
  let anniversariesPosted = 0;

  for (const user of users) {
    if (user.dateOfBirth && sameMonthDay(new Date(user.dateOfBirth), date)) {
      const created = await createCelebrationAnnouncement({
        source: "birthday",
        user,
        template: templates.birthday,
        onDate: date
      });
      if (created) birthdaysPosted += 1;
    }

    if (user.joiningDate && sameMonthDay(new Date(user.joiningDate), date)) {
      const completedYears = yearsSince(new Date(user.joiningDate), date);
      if (completedYears >= 1) {
        const created = await createCelebrationAnnouncement({
          source: "work_anniversary",
          user,
          template: templates.anniversary,
          onDate: date
        });
        if (created) anniversariesPosted += 1;
      }
    }
  }

  return {
    date: dateKeyFromDate(date),
    birthdaysPosted,
    anniversariesPosted
  };
};

export const startCelebrationJob = () => {
  cron.schedule(env.celebrationCron, async () => {
    await runCelebrationAnnouncementsForDate(new Date());
  });
};
