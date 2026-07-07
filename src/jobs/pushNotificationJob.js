import cron from "node-cron";
import dayjs from "dayjs";
import { env } from "../config/env.js";
import { Attendance } from "../models/Attendance.js";
import { Notification } from "../models/Notification.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { createNotification } from "../services/notificationService.js";
import { DEFAULT_ATTENDANCE_POLICY, getShiftWindow, normalizeAttendancePolicy, resolveShiftSnapshot } from "../utils/attendance.js";

const ATTENDANCE_POLICY_KEY = "attendance_policy";
const CHECKIN_REMINDER_TYPE = "attendance_shift_start_checkin_reminder";
const CHECKOUT_REMINDER_TYPE = "attendance_checkout_reminder";
const REMINDER_START_DELAY_MINUTES = 15;
const REMINDER_INTERVAL_MINUTES = 15;
const MAX_SHIFT_REMINDERS = 3;

const RETURN_REMINDER_RULES = {
  Lunch: { minutes: 60, label: "lunch", type: "attendance_lunch_return_reminder" },
  Break: { minutes: 15, label: "break", type: "attendance_break_return_reminder" },
  Permission: { minutes: 60, label: "permission", type: "attendance_permission_return_reminder" }
};

const getAttendancePolicy = async () => {
  const setting = await Setting.findOne({ key: ATTENDANCE_POLICY_KEY }).lean();
  return normalizeAttendancePolicy(setting?.attendancePolicy || DEFAULT_ATTENDANCE_POLICY);
};

const isWorkingDay = (dateKey, policy) => {
  const day = dayjs(dateKey);
  if (!day.isValid()) {
    return false;
  }

  const isoWeekday = day.isoWeekday();
  const allowedWeekDays = Array.isArray(policy?.workWeekDays) ? policy.workWeekDays : DEFAULT_ATTENDANCE_POLICY.workWeekDays;
  if (!allowedWeekDays.includes(isoWeekday)) {
    return false;
  }

  const holidaySet = new Set((policy?.holidays || []).map((item) => item?.date).filter(Boolean));
  if (holidaySet.has(dateKey)) {
    return false;
  }

  return true;
};

const getRecordKey = (userId, dateKey) => `${String(userId)}::${dateKey}`;
const getReminderKey = (userId, type) => `${String(userId)}::${type}`;

const buildReminderIndex = (notifications = []) => {
  const reminderIndex = new Map();

  for (const notification of notifications) {
    const recipients = Array.isArray(notification?.recipients) ? notification.recipients : [];
    for (const recipient of recipients) {
      const key = getReminderKey(recipient, notification.type);
      const current = reminderIndex.get(key) || [];
      current.push(dayjs(notification.createdAt));
      reminderIndex.set(key, current);
    }
  }

  for (const [key, timestamps] of reminderIndex.entries()) {
    reminderIndex.set(
      key,
      timestamps
        .filter((timestamp) => timestamp.isValid())
        .sort((left, right) => left.valueOf() - right.valueOf())
    );
  }

  return reminderIndex;
};

const countRemindersInWindow = ({ reminderIndex, userId, type, windowStart, windowEnd }) => {
  const timestamps = reminderIndex.get(getReminderKey(userId, type)) || [];
  return timestamps.reduce((count, timestamp) => {
    if (timestamp.isBefore(windowStart) || !timestamp.isBefore(windowEnd)) {
      return count;
    }
    return count + 1;
  }, 0);
};

const getNextReminderAt = (anchor, sentCount) => anchor.add(REMINDER_START_DELAY_MINUTES + sentCount * REMINDER_INTERVAL_MINUTES, "minute");

const sendPush = async ({ userId, title, body, type, redirectUrl = "/attendance" }) => {
  await createNotification({
    recipients: [userId],
    title,
    message: body,
    type,
    entityType: "Attendance",
    redirectUrl
  });
};

const isAnyPushChannelEnabled = () => {
  if (env.webPushEnabled) {
    return true;
  }

  return env.mobilePushEnabled;
};

export const startPushNotificationJob = () => {
  if (!isAnyPushChannelEnabled()) {
    console.warn("[pushNotificationJob] Skipped. No push channel is enabled.");
    return;
  }

  console.log(`[pushNotificationJob] Started with cron: ${env.pushNotificationCron}`);
  console.log(`[pushNotificationJob] Channel status -> web: ${env.webPushEnabled}, mobile: ${env.mobilePushEnabled}`);

  cron.schedule(env.pushNotificationCron, async () => {
    try {
      const now = dayjs();
      const todayKey = now.format("YYYY-MM-DD");
      const yesterdayKey = now.subtract(1, "day").format("YYYY-MM-DD");
      const policy = await getAttendancePolicy();

      const users = await User.find({ isActive: true }).select("_id shift").lean();
      if (!users.length) {
        return;
      }

      const userIds = users.map((user) => user._id);
      const attendanceRecords = await Attendance.find({
        user: { $in: userIds },
        date: { $in: [todayKey, yesterdayKey] }
      }).lean();

      const reminderHistory = await Notification.find({
        recipients: { $in: userIds },
        type: { $in: [CHECKIN_REMINDER_TYPE, CHECKOUT_REMINDER_TYPE] },
        createdAt: { $gte: now.subtract(2, "day").startOf("day").toDate() }
      })
        .select("recipients type createdAt")
        .lean();

      const reminderIndex = buildReminderIndex(reminderHistory);

      const attendanceByUserAndDate = new Map(
        attendanceRecords.map((record) => [getRecordKey(record.user, record.date), record])
      );

      let sentCount = 0;
      const sentDedup = new Set();

      const sendOncePerTick = async ({ userId, title, body, type }) => {
        const dedupKey = `${String(userId)}::${type}`;
        if (sentDedup.has(dedupKey)) {
          return false;
        }

        await sendPush({ userId, title, body, type });
        sentDedup.add(dedupKey);
        sentCount += 1;
        return true;
      };

      for (const user of users) {
        const shift = user.shift || "Shift 1";

        // 1) During shift: if user has not checked in, remind at +15, +30 and +45 minutes from shift start.
        if (isWorkingDay(todayKey, policy)) {
          const todayShiftSnapshot = resolveShiftSnapshot({ shift, dateKey: todayKey, policy });
          const { shiftStart: todayShiftStart, shiftEnd: todayShiftEnd } = getShiftWindow(todayKey, todayShiftSnapshot);
          const nowInShiftToday = now.isAfter(todayShiftStart) && now.isBefore(todayShiftEnd);
          const todayAttendance = attendanceByUserAndDate.get(getRecordKey(user._id, todayKey));

          if (nowInShiftToday && (!todayAttendance || !Array.isArray(todayAttendance.sessions) || !todayAttendance.sessions.length)) {
            const checkinRemindersSent = countRemindersInWindow({
              reminderIndex,
              userId: user._id,
              type: CHECKIN_REMINDER_TYPE,
              windowStart: todayShiftStart,
              windowEnd: todayShiftEnd
            });

            const nextCheckinReminderAt = getNextReminderAt(todayShiftStart, checkinRemindersSent);
            if (checkinRemindersSent < MAX_SHIFT_REMINDERS && !now.isBefore(nextCheckinReminderAt)) {
              const sent = await sendOncePerTick({
                userId: user._id,
                title: "Check-in reminder",
                body: "Your shift has started. Please check in.",
                type: CHECKIN_REMINDER_TYPE
              });

              if (sent) {
                const key = getReminderKey(user._id, CHECKIN_REMINDER_TYPE);
                const timestamps = reminderIndex.get(key) || [];
                timestamps.push(now);
                reminderIndex.set(key, timestamps);
              }
            }
          }
        }

        // 2,3,4 + post-shift checkout: evaluate active shift context from today/yesterday records.
        const candidateDateKeys = [todayKey, yesterdayKey];
        for (const dateKey of candidateDateKeys) {
          const record = attendanceByUserAndDate.get(getRecordKey(user._id, dateKey));
          if (!record) {
            continue;
          }

          const shiftSnapshot = record.shiftSnapshot || resolveShiftSnapshot({ shift, dateKey, policy });
          const { shiftStart, shiftEnd, autoCheckoutAt } = getShiftWindow(dateKey, shiftSnapshot);
          const duringShift = now.isAfter(shiftStart) && now.isBefore(shiftEnd);
          const afterShiftBeforeAutoCheckout = now.isAfter(shiftEnd) && now.isBefore(autoCheckoutAt);
          const activeSession = getActiveSession(record);

          if (duringShift) {
            // During shift, if user is currently out and overdue from lunch/break/permission, remind every 2 minutes.
            if (!activeSession) {
              const lastClosedSession = getLastClosedSession(record);
              const reason = String(lastClosedSession?.reason || "");
              const rule = RETURN_REMINDER_RULES[reason];

              if (rule && lastClosedSession?.checkOut) {
                const checkedOutAt = dayjs(lastClosedSession.checkOut);
                const dueAt = checkedOutAt.add(rule.minutes, "minute");

                if (checkedOutAt.isValid() && now.isAfter(dueAt)) {
                  await sendOncePerTick({
                    userId: user._id,
                    title: `${rule.label.charAt(0).toUpperCase()}${rule.label.slice(1)} reminder`,
                    body: `Your ${rule.label} time is over. Please check in to continue work.`,
                    type: rule.type
                  });
                }
              }
            }
          }

          if (afterShiftBeforeAutoCheckout && activeSession) {
            const checkoutRemindersSent = countRemindersInWindow({
              reminderIndex,
              userId: user._id,
              type: CHECKOUT_REMINDER_TYPE,
              windowStart: shiftEnd,
              windowEnd: autoCheckoutAt
            });

            const nextCheckoutReminderAt = getNextReminderAt(shiftEnd, checkoutRemindersSent);
            if (checkoutRemindersSent < MAX_SHIFT_REMINDERS && !now.isBefore(nextCheckoutReminderAt)) {
              const sent = await sendOncePerTick({
                userId: user._id,
                title: "Checkout reminder",
                body: "Are you there? Your shift is over, please check out.",
                type: CHECKOUT_REMINDER_TYPE
              });

              if (sent) {
                const key = getReminderKey(user._id, CHECKOUT_REMINDER_TYPE);
                const timestamps = reminderIndex.get(key) || [];
                timestamps.push(now);
                reminderIndex.set(key, timestamps);
              }
            }
          }
        }
      }

      if (sentCount > 0) {
        console.log(`[pushNotificationJob] Sent ${sentCount} shift-aware push reminder(s) at ${now.toISOString()}`);
      }
    } catch (error) {
      console.error("[pushNotificationJob] Failed to send shift-aware push reminders:", error?.message || error);
    }
  });
};

const getActiveSession = (attendance) => attendance?.sessions?.find((session) => session && !session.checkOut) || null;

const getLastClosedSession = (attendance) => {
  if (!attendance?.sessions?.length) {
    return null;
  }

  const sorted = [...attendance.sessions].sort((left, right) => dayjs(left.checkIn).valueOf() - dayjs(right.checkIn).valueOf());
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const item = sorted[index];
    if (item?.checkOut) {
      return item;
    }
  }

  return null;
};
