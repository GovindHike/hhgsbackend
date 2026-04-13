import cron from "node-cron";
import path from "path";
import { env } from "../config/env.js";
import { Announcement } from "../models/Announcement.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { createNotification } from "../services/notificationService.js";
import { generateBirthdayCard, generateAnniversaryCard } from "../services/birthdayCardService.js";
import { postBirthdayToLinkedIn } from "../services/linkedInService.js";

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

/**
 * Load the system / company user that will appear as the author of all
 * auto-generated celebration announcements.
 * Falls back to null so callers can substitute the employee's own account.
 */
const getSystemUser = async () => {
  try {
    return await User.findOne({ email: env.systemAuthorEmail })
      .select("_id name role")
      .lean();
  } catch {
    return null;
  }
};

const createCelebrationAnnouncement = async ({ source, user, template, onDate, systemUser }) => {
  const quote  = template.defaultQuote || "";
  const years  = source === "work_anniversary" ? Math.max(yearsSince(new Date(user.joiningDate), onDate), 0) : "";
  const values = {
    name:  user.name,
    quote,
    years,
    photo: user.profilePhotoUrl || ""
  };

  const title   = render(template.titleTemplate,   values).trim();
  const content = render(template.contentTemplate, values).trim();

  if (!content) return null;

  // ── Birthday card: generate a composed PNG from the template image ────────
  let media              = [];
  let generatedLocalPath = null;

  if (source === "birthday" || source === "work_anniversary") {
    const card = source === "birthday"
      ? await generateBirthdayCard({
          name:            user.name,
          role:            user.role || "",
          profilePhotoUrl: user.profilePhotoUrl || "",
          outputDir:       path.join(process.cwd(), "uploads", "announcements"),
          baseUrl:         env.backendUrl,
        })
      : await generateAnniversaryCard({
          name:            user.name,
          role:            user.role || "",
          profilePhotoUrl: user.profilePhotoUrl || "",
          joiningDate:     user.joiningDate,
          outputDir:       path.join(process.cwd(), "uploads", "announcements"),
          baseUrl:         env.backendUrl,
        });

    if (card) {
      media              = [{ type: "image", url: card.url }];
      generatedLocalPath = card.localPath;
    }
  }

  // For anniversaries, if card generation fails fall back to the configured imageTemplate.
  if (!media.length) {
    const imageUrl = render(template.imageTemplate, values).trim();
    if (imageUrl && !imageUrl.includes("{{")) {
      media = [{ type: "image", url: imageUrl }];
    }
  }

  // Auto announcements are authored by the system / company account so the
  // feed shows them as company posts rather than the employee's own post.
  // If no system user is configured the employee's account is used as fallback.
  const author   = systemUser || user;
  const todayKey = dateKeyFromDate(onDate);

  try {
    const announcement = await Announcement.create({
      title,
      content,
      media,
      createdBy: author._id,
      autoMeta: {
        source,
        user:    user._id,
        dateKey: todayKey
      }
    });

    const allUsers  = await User.find({ isActive: true }).select("_id").lean();
    const recipients = allUsers.map((u) => u._id);

    await createNotification({
      recipients,
      title:      title || "New Announcement",
      message:    content.slice(0, 160),
      type:       "announcement",
      entityType: "announcement",
      entityId:   announcement._id,
      redirectUrl: "/announcements",
      createdBy:  author._id
    });

    // ── LinkedIn post (birthday only, fire-and-forget) ───────────────────────
    if (source === "birthday" && generatedLocalPath) {
      const commentary =
        `🎂 Happy Birthday, ${user.name}!\n\n` +
        `Wishing ${user.name}` +
        (user.role ? `, our ${user.role},` : "") +
        ` a joyful and memorable birthday filled with happiness and success!\n\n` +
        `#HappyBirthday #TeamCelebration #HikeHealthGS`;

      postBirthdayToLinkedIn({
        name:           user.name,
        role:           user.role || "",
        commentary,
        localImagePath: generatedLocalPath,
      }).catch((err) => console.error("[LinkedIn] fire-and-forget error:", err.message));
    }

    return announcement;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
};

export const runCelebrationAnnouncementsForDate = async (onDate = new Date()) => {
  const date = new Date(onDate);

  // Load templates and the system/company author in parallel
  const [templates, systemUser] = await Promise.all([getTemplates(), getSystemUser()]);

  // Include `role` so the birthday card generator and LinkedIn caption can use it
  const users = await User.find({ isActive: true, $or: [{ dateOfBirth: { $ne: null } }, { joiningDate: { $ne: null } }] })
    .select("_id name role dateOfBirth joiningDate profilePhotoUrl")
    .lean();

  let birthdaysPosted    = 0;
  let anniversariesPosted = 0;

  for (const user of users) {
    if (user.dateOfBirth && sameMonthDay(new Date(user.dateOfBirth), date)) {
      const created = await createCelebrationAnnouncement({
        source:   "birthday",
        user,
        template: templates.birthday,
        onDate:   date,
        systemUser
      });
      if (created) birthdaysPosted += 1;
    }

    if (user.joiningDate && sameMonthDay(new Date(user.joiningDate), date)) {
      const completedYears = yearsSince(new Date(user.joiningDate), date);
      if (completedYears >= 1) {
        const created = await createCelebrationAnnouncement({
          source:   "work_anniversary",
          user,
          template: templates.anniversary,
          onDate:   date,
          systemUser
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
