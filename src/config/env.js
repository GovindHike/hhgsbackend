import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  trustProxyHops: Number(process.env.TRUST_PROXY || 1),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === "production" ? 5000 : 1500)),
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 25),
  announcementReadRateLimitWindowMs: Number(process.env.ANNOUNCEMENT_READ_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  announcementReadRateLimitMax: Number(process.env.ANNOUNCEMENT_READ_RATE_LIMIT_MAX || 120),
  announcementWriteRateLimitWindowMs: Number(process.env.ANNOUNCEMENT_WRITE_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  announcementWriteRateLimitMax: Number(process.env.ANNOUNCEMENT_WRITE_RATE_LIMIT_MAX || 40),
  mongoUri: process.env.MONGO_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  frontendUrl: process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173",
  clientUrl: process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpConnectionTimeoutMs: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
  smtpGreetingTimeoutMs: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
  smtpSocketTimeoutMs: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
  smtpOperationTimeoutMs: Number(process.env.SMTP_OPERATION_TIMEOUT_MS || 15000),
  mailFrom: process.env.MAIL_FROM || "Office Management <no-reply@example.com>",
  autoCheckoutCron: process.env.AUTO_CHECKOUT_CRON || "*/10 * * * *",
  autoCheckoutEveningCron: process.env.AUTO_CHECKOUT_EVENING_CRON || "30 19 * * *",
  autoCheckoutNightCron: process.env.AUTO_CHECKOUT_NIGHT_CRON || "0 3 * * *",
  dailyReportCron: process.env.DAILY_REPORT_CRON || "0 18 * * *",
  celebrationCron: process.env.CELEBRATION_CRON || "5 0 * * *"
};
