import { StatusCodes } from "http-status-codes";
import { Notification } from "../models/Notification.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";

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
