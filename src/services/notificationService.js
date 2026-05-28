import { Notification } from "../models/Notification.js";
import { sendNotification } from "../socket/socketServer.js";
import { sendMobilePushToUsers } from "./mobilePushService.js";
import { sendWebPushToUsers } from "./webPushService.js";

export const createNotification = async ({
  recipients = [],
  title,
  message,
  type,
  entityType = "",
  entityId = null,
  referenceId = null,
  redirectUrl = "",
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
    referenceId: referenceId || entityId,
    redirectUrl,
    createdBy
  });

  const populated = await Notification.findById(notification._id).populate("createdBy", "name role").lean();
  sendNotification(uniqueRecipients, populated);
  await sendWebPushToUsers({
    userIds: uniqueRecipients,
    payload: {
      title: populated.title,
      body: populated.message,
      notificationId: String(populated._id),
      redirectUrl: populated.redirectUrl || "/",
      type: populated.type,
      tag: `notif-${String(populated._id)}`
    }
  });
  await sendMobilePushToUsers({
    userIds: uniqueRecipients,
    payload: {
      title: populated.title,
      body: populated.message,
      notificationId: String(populated._id),
      redirectUrl: populated.redirectUrl || "/attendance",
      type: populated.type,
      tag: `notif-mobile-${String(populated._id)}`
    }
  });
  return populated;
};
