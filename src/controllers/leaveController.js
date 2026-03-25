import { StatusCodes } from "http-status-codes";
import { Leave } from "../models/Leave.js";
import { User } from "../models/User.js";
import { ROLES } from "../utils/constants.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";

export const createLeave = async (req, res) => {
  const requester = await User.findById(req.user._id).select("leaveBalance name role team");
  const leaveUnits =
    req.body.leaveType === "Half Day"
      ? 0.5
      : Math.max(
          1,
          Math.ceil((new Date(req.body.endDate) - new Date(req.body.startDate)) / (1000 * 60 * 60 * 24)) + 1
        );

  if (typeof requester.leaveBalance === "number" && leaveUnits > requester.leaveBalance) {
    throw new AppError("Insufficient leave balance", StatusCodes.BAD_REQUEST);
  }

  const leave = await Leave.create({
    ...req.body,
    user: req.user._id,
    team: req.user.team || null
  });

  if (req.user.role === ROLES.EMPLOYEE) {
    const [teamLeads, admins] = await Promise.all([
      User.find({ role: ROLES.TEAM_LEAD, team: req.user.team }).select("_id").lean(),
      User.find({ role: ROLES.ADMIN }).select("_id").lean()
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

  if (req.user.role === ROLES.TEAM_LEAD) {
    const admins = await User.find({ role: ROLES.ADMIN }).select("_id").lean();
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

  res.status(StatusCodes.CREATED).json({ leave });
};

export const getLeaves = async (req, res) => {
  const filter = {};
  const scope = req.query.scope;

  if (req.user.role === ROLES.EMPLOYEE) {
    filter.user = req.user._id;
  } else if (req.user.role === ROLES.TEAM_LEAD) {
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
      .populate("user", "name email role")
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

export const decideLeave = async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate("user");
  if (!leave) {
    throw new AppError("Leave request not found", StatusCodes.NOT_FOUND);
  }

  if (req.user.role === ROLES.TEAM_LEAD && String(leave.user.team || "") !== String(req.user.team || "")) {
    throw new AppError("You can only manage leave for your own team", StatusCodes.FORBIDDEN);
  }

  leave.status = req.body.status;
  leave.approvedBy = req.user._id;
  leave.decisionAt = new Date();
  await leave.save();

  if (leave.status === "Approved") {
    const leaveUnits =
      leave.leaveType === "Half Day"
        ? 0.5
        : Math.max(1, Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1);
    await User.findByIdAndUpdate(leave.user._id, { $inc: { leaveBalance: -leaveUnits } });
  }

  await createNotification({
    recipients: [leave.user._id],
    title: leave.status === "Approved" ? "Leave Approved" : "Leave Rejected",
    message: `${req.user.name} ${leave.status === "Approved" ? "approved" : "rejected"} your leave request.`,
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

  if (req.user.role === ROLES.EMPLOYEE && String(leave.user._id) !== String(req.user._id)) {
    throw new AppError("You can only delete your own leave request", StatusCodes.FORBIDDEN);
  }

  if (req.user.role === ROLES.TEAM_LEAD && String(leave.user.team || "") !== String(req.user.team || "")) {
    throw new AppError("You can only delete leave requests for your own team", StatusCodes.FORBIDDEN);
  }

  await leave.deleteOne();
  res.status(StatusCodes.OK).json({ message: "Leave deleted successfully" });
};
