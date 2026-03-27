import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpSecure,
  auth: env.smtpUser && env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined
});

// Optionally verify transporter at startup for improved visibility
transporter.verify().catch((error) => {
  console.warn("Email service connection verification failed:", error.message);
});

export const sendEmail = async ({ to, cc, subject, html }) => {
  if (!env.smtpHost) {
    throw new Error("SMTP_HOST is not configured. Cannot send email.");
  }

  if (!env.mailFrom) {
    throw new Error("MAIL_FROM is not configured. Cannot send email.");
  }

  await transporter.sendMail({
    from: env.mailFrom,
    to,
    cc,
    subject,
    html
  });
};
