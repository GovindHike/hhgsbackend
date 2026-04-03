import cron from "node-cron";
import dayjs from "dayjs";
import { env } from "../config/env.js";
import { Attendance } from "../models/Attendance.js";
import { computeAttendanceSummary } from "../utils/attendance.js";
import { notifyAutoCheckout } from "../controllers/attendanceController.js";

/**
 * Auto-checkout logic:
 *  - Morning check-ins (checkIn < 12:30 PM): auto checkout at 7:30 PM same day.
 *    Cron runs at 7:30 PM daily (env.autoCheckoutEveningCron).
 *  - Late check-ins (checkIn >= 12:30 PM): auto checkout at 11:59 PM same day.
 *    Cron runs at 3:00 AM the next day (env.autoCheckoutNightCron) and looks back at the previous date.
 */
export const startAutoCheckoutJob = () => {
  // ─── Evening job: 7:30 PM ───────────────────────────────────────────────────
  // Handles morning check-ins (before 12:30 PM) that still have an open session.
  cron.schedule(env.autoCheckoutEveningCron, async () => {
    try {
      const date = dayjs().format("YYYY-MM-DD");
      const cutoff = dayjs(`${date} 12:30:00`);
      const checkoutAt = dayjs(`${date} 19:30:00`);

      const records = await Attendance.find({ date });

      await Promise.all(
        records.map(async (record) => {
          const lastSession = record.sessions.at(-1);
          if (lastSession && !lastSession.checkOut) {
            const checkInTime = dayjs(lastSession.checkIn);
            if (checkInTime.isBefore(cutoff)) {
              lastSession.checkOut = checkoutAt.toDate();
              const summary = computeAttendanceSummary(record.sessions);
              record.totalHours = summary.totalHours;
              await record.save();
              await notifyAutoCheckout(record.user, record._id, "07:30 PM");
            }
          }
        })
      );
    } catch (err) {
      console.error("[autoCheckoutJob] Evening job error:", err);
    }
  });

  // ─── Night job: 3:00 AM (next day) ──────────────────────────────────────────
  // Handles late check-ins (12:30 PM or later on the previous day) that still
  // have an open session. Sets their checkout time to 11:59 PM of the check-in date.
  cron.schedule(env.autoCheckoutNightCron, async () => {
    try {
      const prevDate = dayjs().subtract(1, "day").format("YYYY-MM-DD");
      const cutoff = dayjs(`${prevDate} 12:30:00`);
      const checkoutAt = dayjs(`${prevDate} 23:59:00`);

      const records = await Attendance.find({ date: prevDate });

      await Promise.all(
        records.map(async (record) => {
          const lastSession = record.sessions.at(-1);
          if (lastSession && !lastSession.checkOut) {
            const checkInTime = dayjs(lastSession.checkIn);
            if (!checkInTime.isBefore(cutoff)) {
              lastSession.checkOut = checkoutAt.toDate();
              const summary = computeAttendanceSummary(record.sessions);
              record.totalHours = summary.totalHours;
              await record.save();
              await notifyAutoCheckout(record.user, record._id, "11:59 PM");
            }
          }
        })
      );
    } catch (err) {
      console.error("[autoCheckoutJob] Night job error:", err);
    }
  });
};
