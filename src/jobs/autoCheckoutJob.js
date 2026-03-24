import cron from "node-cron";
import dayjs from "dayjs";
import { env } from "../config/env.js";
import { Attendance } from "../models/Attendance.js";
import { computeAttendanceSummary } from "../utils/attendance.js";
import { notifyAutoCheckout } from "../controllers/attendanceController.js";

export const startAutoCheckoutJob = () => {
  cron.schedule(env.autoCheckoutCron, async () => {
    const date = dayjs().format("YYYY-MM-DD");
    const records = await Attendance.find({ date });

    await Promise.all(
      records.map(async (record) => {
        const lastSession = record.sessions.at(-1);
        if (lastSession && !lastSession.checkOut) {
          lastSession.checkOut = dayjs(`${date} 23:59:00`).toDate();
          record.totalHours = computeAttendanceSummary(record.sessions).totalHours;
          await record.save();
          await notifyAutoCheckout(record.user, record._id);
        }
      })
    );
  });
};
