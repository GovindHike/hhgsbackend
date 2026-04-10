import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
dayjs.extend(isSameOrBefore);
import { StatusCodes } from "http-status-codes";
import { Leave } from "../models/Leave.js";
import { User } from "../models/User.js";
import { Setting } from "../models/Setting.js";
import { ADMIN_ROLES, TEAM_LEAD_ROLES, EMPLOYEE_ROLES } from "../utils/constants.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";
import { currentLeaveYearStart, leaveYearLabel } from "../jobs/leaveResetJob.js";
import { DEFAULT_ATTENDANCE_POLICY, normalizeAttendancePolicy } from "../utils/attendance.js";

function getBalanceField(type) {
  return type === "SICK" ? "sick" : "planned";
}

function getAvailableBalance(leaveBalance, type) {
  if (!leaveBalance || typeof leaveBalance !== "object") return 0;
  return leaveBalance[getBalanceField(type)] ?? 0;
}

const ATTENDANCE_POLICY_KEY = "attendance_policy";

const getAttendancePolicy = async () => {
  const setting = await Setting.findOne({ key: ATTENDANCE_POLICY_KEY }).lean();
  return normalizeAttendancePolicy(setting?.attendancePolicy || DEFAULT_ATTENDANCE_POLICY);
};

const isWorkingDay = (date, policy) => {
  const normalized = dayjs(date).startOf("day");
  const isoWeekday = normalized.isoWeekday();
  if (!policy.workWeekDays.includes(isoWeekday)) return false;
  const holidayDates = new Set((policy.holidays || []).map((holiday) => dayjs(holiday.date).format("YYYY-MM-DD")));
  return !holidayDates.has(normalized.format("YYYY-MM-DD"));
};

function getLeaveUnits(leave, policy) {
  if (!policy) {
    return leave.leaveType === "Half Day"
      ? 0.5
      : Math.max(1, Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1);
  }

  if (leave.leaveType === "Half Day") {
    return isWorkingDay(leave.startDate, policy) ? 0.5 : 0;
  }

  let units = 0;
  let current = dayjs(leave.startDate).startOf("day");
  const end = dayjs(leave.endDate).startOf("day");

  while (current.isSameOrBefore(end, "day")) {
    if (isWorkingDay(current, policy)) {
      units += 1;
    }
    current = current.add(1, "day");
  }

  return Math.max(0, units);
}

export const createLeave = async (req, res) => {
  const requester = await User.findById(req.user._id).select("leaveBalance name role team");
  const policy = await getAttendancePolicy();
  const leaveUnits = getLeaveUnits(req.body, policy);

  if (leaveUnits <= 0) {
    throw new AppError("Leave request must include at least one working day.", StatusCodes.BAD_REQUEST);
  }

  const balanceField = getBalanceField(req.body.requestedType);
  const availableBalance = getAvailableBalance(requester.leaveBalance, req.body.requestedType);

  if (leaveUnits > availableBalance) {
    throw new AppError(
      `Insufficient ${req.body.requestedType === "SICK" ? "sick" : "planned"} leave balance (available: ${availableBalance} day${availableBalance !== 1 ? "s" : ""})`,
      StatusCodes.BAD_REQUEST
    );
  }

  // All leaves start as Pending — Team Lead / Admin must approve
  const leave = await Leave.create({
    ...req.body,
    user: req.user._id,
    team: req.user.team || null,
    finalType: null,
    validationStatus: "PENDING",
    status: "Pending",
    isDeducted: false,
    adminOverride: false
  });

  if (EMPLOYEE_ROLES.includes(req.user.role)) {
    const [teamLeads, admins] = await Promise.all([
      User.find({ role: { $in: TEAM_LEAD_ROLES }, team: req.user.team }).select("_id").lean(),
      User.find({ role: { $in: ADMIN_ROLES } }).select("_id").lean()
    ]);

    await createNotification({
      recipients: [...teamLeads.map((user) => user._id), ...admins.map((user) => user._id)],
      title: "New leave request",
      message: `${requester.name} submitted a ${req.body.leaveType.toLowerCase()} leave request.`,
      type: "leave_requested",
      entityType: "Leave",
      entityId: leave._id,
      referenceId: leave._id,
      redirectUrl: "/leaves",
      createdBy: req.user._id
    });
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const admins = await User.find({ role: { $in: ADMIN_ROLES } }).select("_id").lean();
    await createNotification({
      recipients: admins.map((user) => user._id),
      title: "Team Lead leave request",
      message: `${requester.name} submitted a ${req.body.leaveType.toLowerCase()} leave request for admin review.`,
      type: "leave_requested",
      entityType: "Leave",
      entityId: leave._id,
      referenceId: leave._id,
      redirectUrl: "/leaves",
      createdBy: req.user._id
    });
  }

  if (ADMIN_ROLES.includes(req.user.role)) {
    const otherAdmins = await User.find({ role: { $in: ADMIN_ROLES }, _id: { $ne: req.user._id } }).select("_id").lean();
    if (otherAdmins.length) {
      await createNotification({
        recipients: otherAdmins.map((user) => user._id),
        title: "Admin leave request",
        message: `${requester.name} submitted a ${req.body.leaveType.toLowerCase()} leave request.`,
        type: "leave_requested",
        entityType: "Leave",
        entityId: leave._id,
        referenceId: leave._id,
        redirectUrl: "/leaves",
        createdBy: req.user._id
      });
    }
  }

  res.status(StatusCodes.CREATED).json({ leave });
};

export const getLeaves = async (req, res) => {
  const filter = {};
  const scope = req.query.scope;

  if (EMPLOYEE_ROLES.includes(req.user.role)) {
    filter.user = req.user._id;
  } else if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const teamMembers = await User.find({ team: req.user.team }).select("_id");
    const memberIds = teamMembers.map((member) => member._id);

    if (scope === "self") {
      filter.user = req.user._id;
    } else if (scope === "team") {
      filter.user = { $in: memberIds.filter((memberId) => String(memberId) !== String(req.user._id)) };
    } else {
      filter.user = { $in: memberIds.concat(req.user._id) };
    }
  } else if (req.query.userId) {
    filter.user = req.query.userId;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.requestedType) {
    filter.requestedType = req.query.requestedType;
  }

  if (req.query.dateFrom || req.query.dateTo) {
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;

    if (dateFrom || dateTo) {
      filter.$and = [
        dateTo ? { startDate: { $lte: dateTo } } : {},
        dateFrom ? { endDate: { $gte: dateFrom } } : {}
      ].filter((condition) => Object.keys(condition).length > 0);
    }
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [leaves, total] = await Promise.all([
    Leave.find(filter)
      .populate("user", "name email role leaveBalance")
      .populate("team", "name")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Leave.countDocuments(filter)
  ]);

  res.status(StatusCodes.OK).json({ leaves, ...buildPaginatedResponse({ items: leaves, total, page, limit }) });
};

export const getLeaveBalance = async (req, res) => {
  const user = await User.findById(req.user._id).select("leaveBalance leaveYearStart name");
  const yearStart = user.leaveYearStart || currentLeaveYearStart();
  const yearEnd = new Date(yearStart);
  yearEnd.setFullYear(yearEnd.getFullYear() + 1);

  // Calculate used leaves for current FY (approved leaves only)
  const policy = await getAttendancePolicy();
  const approvedLeaves = await Leave.find({
    user: req.user._id,
    status: "Approved",
    validationStatus: "APPROVED",
    startDate: { $gte: yearStart, $lt: yearEnd }
  }).lean();

  let plannedUsed = 0;
  let sickUsed = 0;

  for (const leave of approvedLeaves) {
    const leaveUnits = getLeaveUnits(leave, policy);

    if (leave.finalType === "PLANNED") {
      plannedUsed += leaveUnits;
    } else if (leave.finalType === "SICK") {
      sickUsed += leaveUnits;
    }
  }

  const totalPlanned = 12;
  const totalSick = 6;

  const balance = {
    planned: user.leaveBalance?.planned ?? totalPlanned,
    sick: user.leaveBalance?.sick ?? totalSick,
    plannedUsed,
    sickUsed,
    plannedTotal: totalPlanned,
    sickTotal: totalSick
  };

  res.status(StatusCodes.OK).json({
    balance,
    leaveYear: leaveYearLabel(yearStart),
    yearStart: yearStart
  });
};

export const decideLeave = async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate("user");
  if (!leave) {
    throw new AppError("Leave request not found", StatusCodes.NOT_FOUND);
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role) && String(leave.user.team || "") !== String(req.user.team || "")) {
    throw new AppError("You can only manage leave for your own team", StatusCodes.FORBIDDEN);
  }

  const { action } = req.body;
  const decisionReason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";

  if (!["approve", "approve_sick", "convert_planned", "reject"].includes(action)) {
    throw new AppError("Invalid decision action", StatusCodes.BAD_REQUEST);
  }

  if (action === "reject" && !decisionReason) {
    throw new AppError("Rejection reason is required", StatusCodes.BAD_REQUEST);
  }

  const previousDecision = {
    validationStatus: leave.validationStatus,
    status: leave.status,
    finalType: leave.finalType,
    isDeducted: leave.isDeducted
  };

  if (action === "reject") {
    leave.validationStatus = "REJECTED";
    leave.finalType = null;
    leave.status = "Rejected";
    leave.adminOverride = true;
    leave.decisionReason = decisionReason;
  } else if (action === "approve") {
    // Generic approve — honours whatever the employee requested
    leave.validationStatus = "APPROVED";
    leave.finalType = leave.requestedType;
    leave.status = "Approved";
    leave.adminOverride = true;
    leave.decisionReason = null;
  } else if (action === "approve_sick") {
    leave.validationStatus = "APPROVED";
    leave.finalType = "SICK";
    leave.status = "Approved";
    leave.adminOverride = true;
    leave.decisionReason = null;
  } else if (action === "convert_planned") {
    leave.validationStatus = "APPROVED";
    leave.finalType = "PLANNED";
    leave.status = "Approved";
    leave.adminOverride = true;
    leave.decisionReason = null;
  }

  leave.approvedBy = req.user._id;
  leave.decisionAt = new Date();

  const policy = await getAttendancePolicy();
  const wasApprovedAndDeducted =
    previousDecision.isDeducted && previousDecision.validationStatus === "APPROVED" && previousDecision.status === "Approved" && previousDecision.finalType;
  const isApprovedNow = leave.validationStatus === "APPROVED" && leave.status === "Approved" && leave.finalType;
  const leaveUnits = getLeaveUnits(leave, policy);

  const typeChanged = previousDecision.finalType && leave.finalType && previousDecision.finalType !== leave.finalType;

  if (wasApprovedAndDeducted && (!isApprovedNow || typeChanged)) {
    const previousBalanceField = getBalanceField(previousDecision.finalType);
    await User.findByIdAndUpdate(leave.user._id, { $inc: { [`leaveBalance.${previousBalanceField}`]: leaveUnits } });
  }

  if (isApprovedNow && (!wasApprovedAndDeducted || typeChanged)) {
    const userWithBalance = await User.findById(leave.user._id).select("leaveBalance").lean();
    const availableBalance = getAvailableBalance(userWithBalance?.leaveBalance, leave.finalType);

    if (leaveUnits > availableBalance) {
      throw new AppError(
        `Insufficient ${leave.finalType === "SICK" ? "sick" : "planned"} leave balance (available: ${availableBalance} day${availableBalance !== 1 ? "s" : ""})`,
        StatusCodes.BAD_REQUEST
      );
    }

    const nextBalanceField = getBalanceField(leave.finalType);
    await User.findByIdAndUpdate(leave.user._id, { $inc: { [`leaveBalance.${nextBalanceField}`]: -leaveUnits } });
  }

  leave.isDeducted = Boolean(isApprovedNow);

  await leave.save();

  await createNotification({
    recipients: [leave.user._id],
    title: leave.status === "Approved" ? "Leave Approved" : "Leave Rejected",
    message: `${req.user.name} ${leave.status === "Approved" ? "approved" : "rejected"} your leave request.${leave.status === "Rejected" && leave.decisionReason ? ` Reason: ${leave.decisionReason}` : ""}`,
    type: "leave_status_updated",
    entityType: "Leave",
    entityId: leave._id,
    referenceId: leave._id,
    redirectUrl: "/leaves",
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ leave });
};

export const cancelLeave = async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate("user");
  if (!leave) {
    throw new AppError("Leave request not found", StatusCodes.NOT_FOUND);
  }

  if (EMPLOYEE_ROLES.includes(req.user.role) || TEAM_LEAD_ROLES.includes(req.user.role) || ADMIN_ROLES.includes(req.user.role)) {
    if (String(leave.user._id) !== String(req.user._id)) {
      throw new AppError("You can only cancel your own leave request", StatusCodes.FORBIDDEN);
    }
  } else {
    throw new AppError("Only employees, team leads, or admins can cancel their own leave requests", StatusCodes.FORBIDDEN);
  }

  if (leave.status === "Cancelled") {
    throw new AppError("Leave request is already cancelled", StatusCodes.BAD_REQUEST);
  }

  if (leave.status === "Approved" && leave.isDeducted && leave.finalType) {
    const leaveUnits = getLeaveUnits(leave);
    const balanceField = getBalanceField(leave.finalType);
    await User.findByIdAndUpdate(leave.user._id, { $inc: { [`leaveBalance.${balanceField}`]: leaveUnits } });
    leave.isDeducted = false;
  }

  leave.status = "Cancelled";
  leave.validationStatus = "CANCELLED";
  leave.approvedBy = req.user._id;
  leave.decisionAt = new Date();

  await leave.save();

  await createNotification({
    recipients: [leave.user._id],
    title: "Leave Cancelled",
    message: `Your leave request has been cancelled.`,
    type: "leave_status_updated",
    entityType: "Leave",
    entityId: leave._id,
    referenceId: leave._id,
    redirectUrl: "/leaves",
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ leave });
};

export const deleteLeave = async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate("user");
  if (!leave) {
    throw new AppError("Leave request not found", StatusCodes.NOT_FOUND);
  }

  if (EMPLOYEE_ROLES.includes(req.user.role) && String(leave.user._id) !== String(req.user._id)) {
    throw new AppError("You can only delete your own leave request", StatusCodes.FORBIDDEN);
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role) && String(leave.user.team || "") !== String(req.user.team || "")) {
    throw new AppError("You can only delete leave requests for your own team", StatusCodes.FORBIDDEN);
  }

  await leave.deleteOne();
  res.status(StatusCodes.OK).json({ message: "Leave deleted successfully" });
};
