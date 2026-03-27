import { StatusCodes } from "http-status-codes";
import dayjs from "dayjs";
import { Attendance } from "../models/Attendance.js";
import { computeAttendanceSummary } from "../utils/attendance.js";
import { ROLES } from "../utils/constants.js";
import { User } from "../models/User.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";

const todayKey = () => dayjs().format("YYYY-MM-DD");

export const checkIn = async (req, res) => {
  const date = todayKey();
  const attendance = await Attendance.findOne({ user: req.user._id, date });

  const lastSession = attendance?.sessions?.at(-1);
  if (lastSession && !lastSession.checkOut) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Active check-in session already exists" });
  }

  const nextAttendance =
    attendance ||
    (await Attendance.create({
      user: req.user._id,
      date,
      sessions: []
    }));

  nextAttendance.sessions.push({ checkIn: new Date() });
  await nextAttendance.save();

  await createNotification({
    recipients: [req.user._id],
    title: "Checked in",
    message: "Your attendance check-in was recorded successfully.",
    type: "attendance_checked_in",
    entityType: "Attendance",
    entityId: nextAttendance._id,
    referenceId: nextAttendance._id,
    redirectUrl: "/attendance",
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ attendance: nextAttendance });
};

export const checkOut = async (req, res) => {
  const attendance = await Attendance.findOne({ user: req.user._id, date: todayKey() });
  const lastSession = attendance?.sessions?.at(-1);

  if (!lastSession || lastSession.checkOut) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "No active check-in session found" });
  }

  const reason = req.body.reason && ["Lunch", "Permission", "Regular", "Other"].includes(req.body.reason) ? req.body.reason : "Regular";
  lastSession.checkOut = new Date();
  lastSession.reason = reason;
  lastSession.lunchMinutes = reason === "Lunch" ? 60 : 0;
  lastSession.permissionMinutes = reason === "Permission" ? 60 : 0;

  const summary = computeAttendanceSummary(attendance.sessions);
  attendance.totalHours = summary.totalHours;
  attendance.totalLunchMinutes = summary.totalLunchMinutes;
  attendance.totalPermissionMinutes = summary.totalPermissionMinutes;
  await attendance.save();

  await createNotification({
    recipients: [req.user._id],
    title: "Checked out",
    message: "Your attendance check-out was recorded successfully.",
    type: "attendance_checked_out",
    entityType: "Attendance",
    entityId: attendance._id,
    referenceId: attendance._id,
    redirectUrl: "/attendance",
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ attendance });
};

export const notifyAutoCheckout = async (userId, attendanceId) => {
  await createNotification({
    recipients: [userId],
    title: "Auto checked-out",
    message: "Your attendance session was auto checked-out at 11:59 PM.",
    type: "attendance_auto_checkout",
    entityType: "Attendance",
    entityId: attendanceId,
    referenceId: attendanceId,
    redirectUrl: "/attendance"
  });
};

export const getAttendance = async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.EMPLOYEE) {
    filter.user = req.user._id;
  } else if (req.user.role === ROLES.TEAM_LEAD) {
    const teamMembers = await User.find({ team: req.user.team }).select("_id").lean();
    filter.user = { $in: teamMembers.map((member) => member._id).concat(req.user._id) };
  } else if (req.query.employee) {
    filter.user = req.query.employee;
  }
  if (req.query.date) {
    filter.date = req.query.date;
  }
  if (req.query.team && req.user.role !== ROLES.EMPLOYEE) {
    const teamUsers = await User.find({ team: req.query.team }).select("_id").lean();
    filter.user = { $in: teamUsers.map((member) => member._id) };
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .populate({
        path: "user",
        select: "name email team",
        populate: { path: "team", select: "name" }
      })
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Attendance.countDocuments(filter)
  ]);

  res.status(StatusCodes.OK).json({ records, ...buildPaginatedResponse({ items: records, total, page, limit }) });
};

export const getMyTodayAttendance = async (req, res) => {
  const attendance = await Attendance.findOne({ user: req.user._id, date: todayKey() });
  res.status(StatusCodes.OK).json({ attendance });
};
