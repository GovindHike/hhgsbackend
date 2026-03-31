import { StatusCodes } from "http-status-codes";
import { Announcement, ANNOUNCEMENT_REACTION_TYPES } from "../models/Announcement.js";
import { createNotification } from "../services/notificationService.js";
import { User } from "../models/User.js";

export const createAnnouncement = async (req, res) => {
  const { content, title, media = [] } = req.body;
  if (!content || !content.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Content is required" });
  }

  const announcement = await Announcement.create({
    title: (title || "").trim(),
    content: content.trim(),
    media,
    createdBy: req.user._id
  });

  // send global notifications to all active users
  const allUsers = await User.find({ isActive: true }).select("_id");
  const recipients = allUsers.map((u) => u._id);

  await createNotification({
    recipients,
    title: title ? `Announcement: ${title}` : "New Announcement",
    message: content.slice(0, 160),
    type: "announcement",
    entityType: "announcement",
    entityId: announcement._id,
    redirectUrl: "/announcement",
    createdBy: req.user._id
  });

  const populated = await Announcement.findById(announcement._id)
    .populate("createdBy", "name role")
    .populate("replies.user", "name");

  return res.status(StatusCodes.CREATED).json({ announcement: populated });
};

export const getAnnouncements = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  const [announcements, total] = await Promise.all([
    Announcement.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("createdBy", "name role")
      .populate("replies.user", "name"),
    Announcement.countDocuments()
  ]);

  return res.status(StatusCodes.OK).json({
    announcements,
    pagination: { page, limit, total }
  });
};

export const addReaction = async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;

  if (!ANNOUNCEMENT_REACTION_TYPES.includes(type)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Invalid reaction type" });
  }

  const announcement = await Announcement.findById(id);
  if (!announcement) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Announcement not found" });
  }

  const existing = announcement.reactions.find((r) => String(r.user) === String(req.user._id));

  if (existing) {
    if (existing.type === type) {
      announcement.reactions = announcement.reactions.filter((r) => String(r.user) !== String(req.user._id));
    } else {
      existing.type = type;
    }
  } else {
    announcement.reactions.push({ user: req.user._id, type });
  }

  await announcement.save();

  const updated = await Announcement.findById(id)
    .populate("createdBy", "name role")
    .populate("replies.user", "name");

  return res.status(StatusCodes.OK).json({ announcement: updated });
};

export const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  const announcement = await Announcement.findById(id);
  if (!announcement) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Announcement not found" });
  }

  const isAdmin = req.user.role === "Admin";
  const isOwner = String(announcement.createdBy) === String(req.user._id);

  if (!isAdmin && !isOwner) {
    return res.status(StatusCodes.FORBIDDEN).json({ message: "Not authorized to delete this announcement" });
  }

  await Announcement.findByIdAndDelete(id);
  return res.status(StatusCodes.OK).json({ message: "Announcement deleted" });
};

export const addReply = async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Reply message is required" });
  }

  const announcement = await Announcement.findById(id);
  if (!announcement) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Announcement not found" });
  }

  announcement.replies.push({ user: req.user._id, message: message.trim() });
  await announcement.save();

  const updated = await Announcement.findById(id)
    .populate("createdBy", "name role")
    .populate("replies.user", "name");

  return res.status(StatusCodes.CREATED).json({ announcement: updated });
};
