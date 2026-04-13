import cron from "node-cron";
import dayjs from "dayjs";
import { env } from "../config/env.js";
import { Attendance } from "../models/Attendance.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { applyLunchBreakPolicy, computeAttendanceSummary, DEFAULT_ATTENDANCE_POLICY, getShiftWindow, normalizeAttendancePolicy, resolveShiftSnapshot } from "../utils/attendance.js";
import { notifyAutoCheckout, notifyLunchCheckoutReminder, notifyMissedCheckoutReminder } from "../controllers/attendanceController.js";

const ATTENDANCE_POLICY_KEY = "attendance_policy";

const getAttendancePolicy = async () => {
  const setting = await Setting.findOne({ key: ATTENDANCE_POLICY_KEY }).lean();
  return normalizeAttendancePolicy(setting?.attendancePolicy || DEFAULT_ATTENDANCE_POLICY);
};

const resolveRecordShiftSnapshot = async (record, policy) => {
  if (record?.shiftSnapshot?.startTime && record?.shiftSnapshot?.endTime) {
    return record.shiftSnapshot;
  }

  const lastSession = record?.sessions?.at(-1);
  if (lastSession?.shiftSnapshot?.startTime && lastSession?.shiftSnapshot?.endTime) {
    record.shiftSnapshot = lastSession.shiftSnapshot;
    return record.shiftSnapshot;
  }

  const attendanceUser = await User.findById(record.user).select("shift").lean();
  record.shiftSnapshot = resolveShiftSnapshot({
    shift: attendanceUser?.shift || "Shift 1",
    dateKey: record.date,
    policy
  });

  if (lastSession && !lastSession.shiftSnapshot) {
    lastSession.shiftSnapshot = record.shiftSnapshot;
  }

  return record.shiftSnapshot;
};

export const startAutoCheckoutJob = () => {
  cron.schedule(env.autoCheckoutCron, async () => {
    try {
      const candidateDates = [dayjs().format("YYYY-MM-DD"), dayjs().subtract(1, "day").format("YYYY-MM-DD")];
      const records = await Attendance.find({ date: { $in: candidateDates } });
      const attendancePolicy = await getAttendancePolicy();

      await Promise.all(
        records.map(async (record) => {
          const lastSession = record.sessions.at(-1);
          if (!lastSession || lastSession.checkOut) {
            return;
          }

          const shiftSnapshot = await resolveRecordShiftSnapshot(record, attendancePolicy);

          const { shiftEnd, reminderAt, autoCheckoutAt } = getShiftWindow(record.date, shiftSnapshot);
          const now = dayjs();

          const lunchBreakStart = shiftSnapshot?.lunchBreakStart ? dayjs(`${record.date} ${shiftSnapshot.lunchBreakStart}`) : null;
          const lunchBreakEnd = shiftSnapshot?.lunchBreakEnd ? dayjs(`${record.date} ${shiftSnapshot.lunchBreakEnd}`) : null;

          if (
            lunchBreakStart &&
            lunchBreakEnd &&
            lunchBreakStart.isValid() &&
            lunchBreakEnd.isValid() &&
            !lastSession.lunchReminderSentAt &&
            now.isAfter(lunchBreakStart) &&
            now.isBefore(lunchBreakEnd)
          ) {
            lastSession.lunchReminderSentAt = now.toDate();
            await record.save();
            await notifyLunchCheckoutReminder(
              record.user,
              record._id,
              `${lunchBreakStart.format("hh:mm A")} - ${lunchBreakEnd.format("hh:mm A")}`
            );
            return;
          }

          if (!lastSession.reminderSentAt && now.isAfter(reminderAt) && now.isBefore(autoCheckoutAt)) {
            lastSession.reminderSentAt = now.toDate();
            await record.save();
            await notifyMissedCheckoutReminder(record.user, record._id, shiftEnd.format("hh:mm A"));
            return;
          }

          if (now.isAfter(autoCheckoutAt)) {
            lastSession.checkOut = shiftEnd.toDate();
            lastSession.autoCheckoutApplied = true;
            lastSession.autoCheckedOutAt = now.toDate();
            applyLunchBreakPolicy(record, now);
            const summary = computeAttendanceSummary(record.sessions, record.shiftSnapshot || shiftSnapshot);
            record.totalHours = summary.totalHours;
            record.totalLunchMinutes = summary.totalLunchMinutes;
            record.totalPermissionMinutes = summary.totalPermissionMinutes;
            record.expectedHours = summary.expectedHours;
            record.varianceHours = summary.varianceHours;
            record.missedCheckoutCount = summary.missedCheckoutCount;
            await record.save();
            await notifyAutoCheckout(record.user, record._id, shiftEnd.format("hh:mm A"));
          }
        })
      );
    } catch (err) {
      console.error("[autoCheckoutJob] Shift-aware job error:", err);
    }
  });
};
