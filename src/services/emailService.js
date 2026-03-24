import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpSecure,
  auth: env.smtpUser && env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined
});

export const sendEmail = async ({ to, cc, subject, html }) => {
  if (!env.smtpHost) {
    return;
  }

  await transporter.sendMail({
    from: env.mailFrom,
    to,
    cc,
    subject,
    html
  });
};
