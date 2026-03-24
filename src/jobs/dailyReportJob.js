import cron from "node-cron";
import { env } from "../config/env.js";
import { sendDailyProjectStatusReport } from "../services/reportService.js";

export const startDailyReportJob = () => {
  cron.schedule(env.dailyReportCron, async () => {
    await sendDailyProjectStatusReport();
  });
};
