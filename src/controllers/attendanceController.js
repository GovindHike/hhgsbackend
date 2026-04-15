import { StatusCodes } from "http-status-codes";
import dayjs from "dayjs";
import { Attendance } from "../models/Attendance.js";
import { applyLunchBreakPolicy, buildAttendanceSummary, computeAttendanceSummary, getShiftWindow, getSummaryRange, normalizeAttendancePolicy, resolveShiftSnapshot, DEFAULT_ATTENDANCE_POLICY } from "../utils/attendance.js";
import { TEAM_LEAD_ROLES, EMPLOYEE_ROLES, ADMIN_ROLES } from "../utils/constants.js";
import { User } from "../models/User.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";
import { Setting } from "../models/Setting.js";

const todayKey = () => dayjs().format("YYYY-MM-DD");
const ATTENDANCE_POLICY_KEY = "attendance_policy";
const VALID_CHECKOUT_REASONS = ["Lunch", "Permission", "Regular", "Other"];

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
  applyLunchBreakPolicy(attendance, dayjs());
  const summary = computeAttendanceSummary(attendance.sessions, attendance.shiftSnapshot);
  attendance.totalHours = summary.totalHours;
  attendance.totalLunchMinutes = summary.totalLunchMinutes;
  attendance.totalPermissionMinutes = summary.totalPermissionMinutes;
  attendance.expectedHours = summary.expectedHours;
  attendance.varianceHours = summary.varianceHours;
  attendance.missedCheckoutCount = summary.missedCheckoutCount;
  return summary;
};

const hydrateAttendanceSummary = (attendance) => {
  if (!attendance) return attendance;

  const fallbackShiftSnapshot = attendance.shiftSnapshot || attendance.sessions?.at(-1)?.shiftSnapshot || attendance.sessions?.[0]?.shiftSnapshot || null;
  const summary = computeAttendanceSummary(attendance.sessions || [], fallbackShiftSnapshot);

  attendance.shiftSnapshot = fallbackShiftSnapshot;
  attendance.totalHours = summary.totalHours;
  attendance.totalLunchMinutes = summary.totalLunchMinutes;
  attendance.totalPermissionMinutes = summary.totalPermissionMinutes;
  attendance.expectedHours = summary.expectedHours;
  attendance.varianceHours = summary.varianceHours;
  attendance.missedCheckoutCount = summary.missedCheckoutCount;

  return attendance;
};

const getReferenceDate = (query = {}) => {
  if (query.month) {
    return `${query.month}-01`;
  }

  return query.date || todayKey();
};

const normalizeCheckoutReason = (reason) => (
  reason && VALID_CHECKOUT_REASONS.includes(reason) ? reason : "Regular"
);

const applySessionCheckout = (session, { checkoutAt, reason, reasonNote }) => {
  const normalizedReason = normalizeCheckoutReason(reason);

  session.checkOut = checkoutAt;
  session.reason = normalizedReason;
  session.reasonNote = reasonNote?.trim?.() || "";
  session.lunchMinutes = normalizedReason === "Lunch" ? 60 : 0;
  session.permissionMinutes = normalizedReason === "Permission" ? 60 : 0;
  session.autoCheckoutApplied = false;
  session.autoCheckedOutAt = null;
};

const autoCheckoutOverdueSession = async (attendance, fallbackShift, referenceMoment = dayjs()) => {
  const lastSession = attendance?.sessions?.at(-1);
  if (!lastSession || lastSession.checkOut) {
    return attendance;
  }

  const shiftSnapshot = await resolveAttendanceShiftSnapshot(attendance, fallbackShift);
  if (!lastSession.shiftSnapshot) {
    lastSession.shiftSnapshot = shiftSnapshot;
  }

  const { shiftEnd, autoCheckoutAt } = getShiftWindow(attendance.date, shiftSnapshot);
  const now = dayjs(referenceMoment);

  if (!shiftEnd.isValid() || !autoCheckoutAt.isValid() || !now.isAfter(autoCheckoutAt)) {
    return attendance;
  }

  const normalizedReason = normalizeCheckoutReason(lastSession.reason);
  lastSession.checkOut = shiftEnd.toDate();
  lastSession.reason = normalizedReason;
  lastSession.reasonNote = lastSession.reasonNote?.trim?.() || "";
  lastSession.lunchMinutes = normalizedReason === "Lunch" ? 60 : 0;
  lastSession.permissionMinutes = normalizedReason === "Permission" ? 60 : 0;
  lastSession.autoCheckoutApplied = true;
  lastSession.autoCheckedOutAt = now.toDate();

  applyAttendanceSummary(attendance);
  await attendance.save();

  const notificationRecipient = attendance.user?._id || attendance.user;
  await notifyAutoCheckout(notificationRecipient, attendance._id, shiftEnd.format("hh:mm A"));

  return attendance;
};

const prepareAttendanceForResponse = async (attendance, fallbackShift) => {
  if (!attendance) return null;

  await autoCheckoutOverdueSession(attendance, fallbackShift);

  const plainAttendance = typeof attendance.toObject === "function" ? attendance.toObject() : attendance;
  return hydrateAttendanceSummary(plainAttendance);
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

  applySessionCheckout(lastSession, {
    checkoutAt: new Date(),
    reason: req.body.reason,
    reasonNote: req.body.reasonNote
  });

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

export const notifyLunchCheckoutReminder = async (userId, attendanceId, lunchWindowLabel) => {
  await createNotification({
    recipients: [userId],
    title: "Lunch reminder",
    message: `Lunch window ${lunchWindowLabel} is active. Please check out with reason \"Lunch\" and check in again after lunch.`,
    type: "attendance_lunch_checkout_reminder",
    entityType: "Attendance",
    entityId: attendanceId,
    referenceId: attendanceId,
    redirectUrl: "/attendance"
  });
};

/**
 * Admin: Record a checkout for an open attendance session using a chosen time and reason.
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

  const checkoutMoment = dayjs(req.body.checkoutAt);
  if (!checkoutMoment.isValid()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Valid checkout time is required" });
  }

  if (checkoutMoment.format("YYYY-MM-DD") !== attendance.date) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Checkout time must match the attendance date" });
  }

  if (checkoutMoment.isBefore(dayjs(lastSession.checkIn))) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Checkout time must be after check-in" });
  }

  if (attendance.date === todayKey() && checkoutMoment.isAfter(dayjs())) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Checkout time cannot be in the future" });
  }

  applySessionCheckout(lastSession, {
    checkoutAt: checkoutMoment.toDate(),
    reason: req.body.reason,
    reasonNote: req.body.reasonNote
  });

  applyAttendanceSummary(attendance);
  await attendance.save();

  await createNotification({
    recipients: [attendance.user],
    title: "Checked out",
    message: `An admin recorded your attendance check-out at ${checkoutMoment.format("hh:mm A")}.`,
    type: "attendance_checked_out",
    entityType: "Attendance",
    entityId: attendance._id,
    referenceId: attendance._id,
    redirectUrl: "/attendance",
    createdBy: req.user._id
  });

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
  const [attendanceItems, total] = await Promise.all([
    Attendance.find(filter)
      .populate({
        path: "user",
        select: "name email employeeCode team shift",
        populate: { path: "team", select: "name" }
      })
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter)
  ]);

  const records = await Promise.all(attendanceItems.map((item) => prepareAttendanceForResponse(item, item.user?.shift)));

  res.status(StatusCodes.OK).json({ records, ...buildPaginatedResponse({ items: records, total, page, limit }) });
};

export const getMyTodayAttendance = async (req, res) => {
  const attendance = await Attendance.findOne({ user: req.user._id, date: todayKey() });
  const policy = await getAttendancePolicy();
  const shift = await getUserShift(req);
  const hydratedAttendance = attendance ? await prepareAttendanceForResponse(attendance, shift) : null;
  const shiftSnapshot = hydratedAttendance?.shiftSnapshot || resolveShiftSnapshot({ shift, dateKey: todayKey(), policy });
  res.status(StatusCodes.OK).json({ attendance: hydratedAttendance, shiftSnapshot, attendancePolicy: policy });
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

  const attendanceItems = await Attendance.find(filter)
    .populate({
      path: "user",
      select: "name email team shift",
      populate: { path: "team", select: "name" }
    })
    .sort({ date: 1 });

  const records = await Promise.all(attendanceItems.map((item) => prepareAttendanceForResponse(item, item.user?.shift)));

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
