import http from "http";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startAutoCheckoutJob } from "./jobs/autoCheckoutJob.js";
import { startDailyReportJob } from "./jobs/dailyReportJob.js";
import { migrateLeaveBalance } from "./jobs/migrateLeaveBalance.js";
import { migrateAnnouncementMedia } from "./jobs/migrateAnnouncementMedia.js";
import { resetLeaveBalances, startLeaveResetJob } from "./jobs/leaveResetJob.js";
import { startCelebrationJob } from "./jobs/celebrationJob.js";
import { startPushNotificationJob } from "./jobs/pushNotificationJob.js";
import { initSocketServer } from "./socket/socketServer.js";
import { initializeWebPush } from "./services/webPushService.js";

const startServer = async () => {
  await connectDatabase();
  await migrateLeaveBalance();
  await migrateAnnouncementMedia();
  await resetLeaveBalances();
  const app = createApp();
  const httpServer = http.createServer(app);

  initSocketServer(httpServer, env.clientUrl);
  initializeWebPush();

  httpServer.listen(env.port, () => {
    console.log(`Backend server running on port ${env.port}`);
  });

  startAutoCheckoutJob();
  startDailyReportJob();
  startLeaveResetJob();
  startCelebrationJob();
  startPushNotificationJob();
};

startServer();
