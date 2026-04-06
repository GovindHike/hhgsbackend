import { StatusCodes } from "http-status-codes";
import dayjs from "dayjs";
import { Attendance } from "../models/Attendance.js";
import { buildAttendanceSummary, computeAttendanceSummary, getSummaryRange, getShiftWindow, normalizeAttendancePolicy, resolveShiftSnapshot, DEFAULT_ATTENDANCE_POLICY } from "../utils/attendance.js";
import { TEAM_LEAD_ROLES, EMPLOYEE_ROLES, ADMIN_ROLES } from "../utils/constants.js";
import { User } from "../models/User.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";
import { Setting } from "../models/Setting.js";

const todayKey = () => dayjs().format("YYYY-MM-DD");
const ATTENDANCE_POLICY_KEY = "attendance_policy";

const getAttendancePolicy = async () => {
  const setting = await Setting.findOne({ key: ATTENDANCE_POLICY_KEY }).lean();
  return normalizeAttendancePolicy(setting?.attendancePolicy || DEFAULT_ATTENDANCE_POLICY);
};

const resolveAttendanceShiftSnapshot = async (attendance, fallbackShift) => {
  if (attendance?.shiftSnapshot?.startTime && attendance?.shiftSnapshot?.endTime) {
    return attendance.shiftSnapshot;
  }

  const lastSession = attendance?.sessions?.at(-1);
  if (lastSession?.shiftSnapshot?.startTime && lastSession?.shiftSnapshot?.endTime) {
    attendance.shiftSnapshot = lastSession.shiftSnapshot;
    return attendance.shiftSnapshot;
  }

  const policy = await getAttendancePolicy();
  let shift = fallbackShift;

  if (!shift && attendance?.user) {
    const attendanceUser = await User.findById(attendance.user).select("shift").lean();
    shift = attendanceUser?.shift;
  }

  attendance.shiftSnapshot = resolveShiftSnapshot({
    shift: shift || "Shift 1",
    dateKey: attendance.date,
    policy
  });

  return attendance.shiftSnapshot;
};

const getUserShift = async (req) => {
  if (req.user?.shift) {
    return req.user.shift;
  }

  const user = await User.findById(req.user._id).select("shift").lean();
  return user?.shift || "Shift 1";
};

const applyAttendanceSummary = (attendance) => {
  const summary = computeAttendanceSummary(attendance.sessions, attendance.shiftSnapshot);
  attendance.totalHours = summary.totalHours;
  attendance.totalLunchMinutes = summary.totalLunchMinutes;
  attendance.totalPermissionMinutes = summary.totalPermissionMinutes;
  attendance.expectedHours = summary.expectedHours;
  attendance.varianceHours = summary.varianceHours;
  attendance.missedCheckoutCount = summary.missedCheckoutCount;
  return summary;
};

const getReferenceDate = (query = {}) => {
  if (query.month) {
    return `${query.month}-01`;
  }

  return query.date || todayKey();
};

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
      shiftSnapshot: resolveShiftSnapshot({
        shift: await getUserShift(req),
        dateKey: date,
        policy: await getAttendancePolicy()
      }),
      sessions: []
    }));

  if (!nextAttendance.shiftSnapshot) {
    nextAttendance.shiftSnapshot = resolveShiftSnapshot({
      shift: await getUserShift(req),
      dateKey: date,
      policy: await getAttendancePolicy()
    });
  }

  nextAttendance.expectedHours = nextAttendance.shiftSnapshot.expectedHours;
  nextAttendance.sessions.push({
    checkIn: new Date(),
    shiftSnapshot: nextAttendance.shiftSnapshot
  });
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

  const shiftSnapshot = await resolveAttendanceShiftSnapshot(attendance, await getUserShift(req));
  if (!lastSession.shiftSnapshot) {
    lastSession.shiftSnapshot = shiftSnapshot;
  }

  const normalizedReason = req.body.reason && ["Lunch", "Permission", "Regular", "Other"].includes(req.body.reason) ? req.body.reason : "Regular";
  lastSession.checkOut = new Date();
  lastSession.reason = normalizedReason;
  lastSession.reasonNote = req.body.reasonNote?.trim?.() || "";
  lastSession.lunchMinutes = normalizedReason === "Lunch" ? 60 : 0;
  lastSession.permissionMinutes = normalizedReason === "Permission" ? 60 : 0;

  applyAttendanceSummary(attendance);
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

export const notifyAutoCheckout = async (userId, attendanceId, checkoutTime = "11:59 PM") => {
  await createNotification({
    recipients: [userId],
    title: "Auto checked-out",
    message: `Your attendance session was auto checked-out at ${checkoutTime}.`,
    type: "attendance_auto_checkout",
    entityType: "Attendance",
    entityId: attendanceId,
    referenceId: attendanceId,
    redirectUrl: "/attendance"
  });
};

export const notifyMissedCheckoutReminder = async (userId, attendanceId, shiftEndTime) => {
  await createNotification({
    recipients: [userId],
    title: "Checkout reminder",
    message: `You are still checked in after your shift ended at ${shiftEndTime}. Please check out to keep attendance accurate.`,
    type: "attendance_checkout_reminder",
    entityType: "Attendance",
    entityId: attendanceId,
    referenceId: attendanceId,
    redirectUrl: "/attendance"
  });
};

/**
 * Admin: Force-checkout an open attendance session.
 * - Morning check-ins (before 12:30 PM) → check out at 07:30 PM.
 * - Late check-ins (12:30 PM or later)  → check out at 11:59 PM.
 */
export const adminForceCheckout = async (req, res) => {
  const { id } = req.params;

  const attendance = await Attendance.findById(id);
  if (!attendance) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Attendance record not found" });
  }

  const lastSession = attendance.sessions.at(-1);
  if (!lastSession || lastSession.checkOut) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "No active check-in session found" });
  }

  const sessionShiftSnapshot = await resolveAttendanceShiftSnapshot(attendance);
  if (!lastSession.shiftSnapshot) {
    lastSession.shiftSnapshot = sessionShiftSnapshot;
  }
  const { shiftEnd } = getShiftWindow(attendance.date, sessionShiftSnapshot);
  const checkoutAt = shiftEnd;

  lastSession.checkOut = checkoutAt.toDate();
  lastSession.autoCheckoutApplied = true;
  lastSession.autoCheckedOutAt = new Date();
  applyAttendanceSummary(attendance);
  await attendance.save();

  await notifyAutoCheckout(attendance.user, attendance._id, checkoutAt.format("hh:mm A"));

  res.status(StatusCodes.OK).json({ attendance });
};

export const getAttendance = async (req, res) => {
  const filter = {};
  if (EMPLOYEE_ROLES.includes(req.user.role)) {
    filter.user = req.user._id;
  } else if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const teamMembers = await User.find({ team: req.user.team }).select("_id").lean();
    filter.user = { $in: teamMembers.map((member) => member._id).concat(req.user._id) };
  } else if (req.query.employee) {
    filter.user = req.query.employee;
  }
  if (req.query.date) {
    filter.date = req.query.date;
  } else if (req.query.month) {
    const monthStart = `${req.query.month}-01`;
    const monthEnd = dayjs(monthStart).endOf("month").format("YYYY-MM-DD");
    filter.date = { $gte: monthStart, $lte: monthEnd };
  }
  if (req.query.team && !EMPLOYEE_ROLES.includes(req.user.role)) {
    const teamUsers = await User.find({ team: req.query.team }).select("_id").lean();
    filter.user = { $in: teamUsers.map((member) => member._id) };
  }
  if (req.query.shift) {
    const shiftUsers = await User.find({ shift: req.query.shift }).select("_id").lean();
    const shiftUserIds = shiftUsers.map((member) => member._id);
    if (filter.user?.$in) {
      filter.user = {
        $in: filter.user.$in.filter((memberId) => shiftUserIds.some((shiftUserId) => String(shiftUserId) === String(memberId)))
      };
    } else {
      filter.user = { $in: shiftUserIds };
    }
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .populate({
        path: "user",
        select: "name email team shift",
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
  const policy = await getAttendancePolicy();
  const shift = await getUserShift(req);
  const shiftSnapshot = attendance?.shiftSnapshot || resolveShiftSnapshot({ shift, dateKey: todayKey(), policy });
  res.status(StatusCodes.OK).json({ attendance, shiftSnapshot, attendancePolicy: policy });
};

export const getAttendanceSummary = async (req, res) => {
  const filter = {};
  if (EMPLOYEE_ROLES.includes(req.user.role)) {
    filter.user = req.user._id;
  } else if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const teamMembers = await User.find({ team: req.user.team }).select("_id").lean();
    filter.user = { $in: teamMembers.map((member) => member._id).concat(req.user._id) };
  } else if (req.query.employee) {
    filter.user = req.query.employee;
  }

  if (req.query.team && !EMPLOYEE_ROLES.includes(req.user.role)) {
    const teamUsers = await User.find({ team: req.query.team }).select("_id").lean();
    filter.user = { $in: teamUsers.map((member) => member._id) };
  }
  if (req.query.shift) {
    const shiftUsers = await User.find({ shift: req.query.shift }).select("_id").lean();
    const shiftUserIds = shiftUsers.map((member) => member._id);
    if (filter.user?.$in) {
      filter.user = {
        $in: filter.user.$in.filter((memberId) => shiftUserIds.some((shiftUserId) => String(shiftUserId) === String(memberId)))
      };
    } else {
      filter.user = { $in: shiftUserIds };
    }
  }

  const period = req.query.period === "month" ? "month" : "week";
  const range = getSummaryRange({ period, referenceDate: getReferenceDate(req.query) });
  filter.date = {
    $gte: range.start.format("YYYY-MM-DD"),
    $lte: range.end.format("YYYY-MM-DD")
  };

  const records = await Attendance.find(filter)
    .populate({
      path: "user",
      select: "name email team shift",
      populate: { path: "team", select: "name" }
    })
    .sort({ date: 1 })
    .lean();

  const summary = buildAttendanceSummary(records, { period, referenceDate: getReferenceDate(req.query) });

  if (EMPLOYEE_ROLES.includes(req.user.role)) {
    return res.status(StatusCodes.OK).json({ summary, records });
  }

  const grouped = records.reduce((accumulator, record) => {
    const userId = String(record.user?._id || record.user);
    if (!accumulator[userId]) {
      accumulator[userId] = {
        user: record.user,
        records: []
      };
    }

    accumulator[userId].records.push(record);
    return accumulator;
  }, {});

  const members = Object.values(grouped).map((entry) => ({
    user: entry.user,
    summary: buildAttendanceSummary(entry.records, { period, referenceDate: getReferenceDate(req.query) })
  }));

  res.status(StatusCodes.OK).json({ summary, members, records });
};
