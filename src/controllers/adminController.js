import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { broadcastTemplate } from "../utils/emailTemplates.js";
import { sendEmail } from "../services/emailService.js";
import { getDailyProjectStatusReportPayload, sendDailyProjectStatusReport } from "../services/reportService.js";

export const sendBroadcastEmail = async (req, res) => {
  const users = await User.find({ isActive: true }).select("email");
  const recipients = users.map((user) => user.email);
  const mail = broadcastTemplate(req.body);

  await Promise.all(recipients.map((email) => sendEmail({ to: email, ...mail })));
  res.status(StatusCodes.OK).json({ message: "Broadcast email processed" });
};

export const sendDailyStatusReport = async (_req, res) => {
  await sendDailyProjectStatusReport();
  res.status(StatusCodes.OK).json({ message: "Daily project status report sent" });
};

export const previewDailyStatusReport = async (_req, res) => {
  const payload = await getDailyProjectStatusReportPayload();
  res.status(StatusCodes.OK).json({
    subject: payload.mail.subject,
    html: payload.mail.html,
    recipients: payload.recipients,
    summary: payload.data
  });
};
