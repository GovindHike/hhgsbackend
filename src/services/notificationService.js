import { Notification } from "../models/Notification.js";
import { sendNotification } from "../socket/socketServer.js";

export const createNotification = async ({
  recipients = [],
  title,
  message,
  type,
  entityType = "",
  entityId = null,
  createdBy = null
}) => {
  const uniqueRecipients = [...new Set(recipients.map((id) => String(id)))];
  if (!uniqueRecipients.length) {
    return null;
  }

  const notification = await Notification.create({
    recipients: uniqueRecipients,
    title,
    message,
    type,
    entityType,
    entityId,
    createdBy
  });

  const populated = await Notification.findById(notification._id).populate("createdBy", "name role").lean();
  sendNotification(uniqueRecipients, populated);
  return populated;
};
