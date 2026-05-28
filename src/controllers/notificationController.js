import { StatusCodes } from "http-status-codes";
import { Notification } from "../models/Notification.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { env } from "../config/env.js";
import { removeMobilePushToken, saveMobilePushToken } from "../services/mobilePushService.js";
import { getWebPushPublicKey, removePushSubscription, savePushSubscription } from "../services/webPushService.js";

export const getNotifications = async (req, res) => {
  const filter = { recipients: req.user._id };
  if (req.query.unread === "true") {
    filter.readBy = { $ne: req.user._id };
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name role")
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipients: req.user._id, readBy: { $ne: req.user._id } })
  ]);

  res.status(StatusCodes.OK).json({
    notifications,
    unreadCount,
    ...buildPaginatedResponse({ items: notifications, total, page, limit })
  });
};

export const markNotificationRead = async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipients: req.user._id },
    { $addToSet: { readBy: req.user._id } },
    { new: true }
  ).lean();

  res.status(StatusCodes.OK).json({ notification });
};

export const markAllNotificationsRead = async (req, res) => {
  await Notification.updateMany(
    { recipients: req.user._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );

  res.status(StatusCodes.OK).json({ message: "Notifications marked as read" });
};

export const getPushPublicKey = async (_req, res) => {
  if (!env.webPushEnabled) {
    throw new AppError("Web push notifications are not configured", StatusCodes.SERVICE_UNAVAILABLE);
  }

  res.status(StatusCodes.OK).json({ publicKey: getWebPushPublicKey() });
};

export const subscribePush = async (req, res) => {
  if (!env.webPushEnabled) {
    throw new AppError("Web push notifications are not configured", StatusCodes.SERVICE_UNAVAILABLE);
  }

  await savePushSubscription({
    userId: req.user._id,
    subscription: req.body.subscription,
    userAgent: req.headers["user-agent"] || ""
  });

  res.status(StatusCodes.OK).json({ message: "Push subscription saved" });
};

export const unsubscribePush = async (req, res) => {
  await removePushSubscription({
    userId: req.user._id,
    endpoint: req.body.endpoint
  });

  res.status(StatusCodes.OK).json({ message: "Push subscription removed" });
};

export const registerPushToken = async (req, res) => {
  await saveMobilePushToken({
    userId: req.user._id,
    token: req.body.token,
    provider: req.body.provider,
    platform: req.body.platform,
    app: req.body.app
  });

  res.status(StatusCodes.OK).json({ message: "Mobile push token saved" });
};

export const unregisterPushToken = async (req, res) => {
  await removeMobilePushToken({
    userId: req.user._id,
    token: req.body.token
  });

  res.status(StatusCodes.OK).json({ message: "Mobile push token removed" });
};
