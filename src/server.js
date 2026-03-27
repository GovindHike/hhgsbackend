import http from "http";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startAutoCheckoutJob } from "./jobs/autoCheckoutJob.js";
import { startDailyReportJob } from "./jobs/dailyReportJob.js";
import { migrateLeaveBalance } from "./jobs/migrateLeaveBalance.js";
import { resetLeaveBalances, startLeaveResetJob } from "./jobs/leaveResetJob.js";
import { initSocketServer } from "./socket/socketServer.js";

const startServer = async () => {
  await connectDatabase();
  await migrateLeaveBalance();
  await resetLeaveBalances();
  const app = createApp();
  const httpServer = http.createServer(app);

  initSocketServer(httpServer, env.clientUrl);

  httpServer.listen(env.port, () => {
    console.log(`Backend server running on port ${env.port}`);
  });

  startAutoCheckoutJob();
  startDailyReportJob();
  startLeaveResetJob();
};

startServer();
