import { StatusCodes } from "http-status-codes";
import { Task } from "../models/Task.js";
import { Team } from "../models/Team.js";
import { User } from "../models/User.js";
import { ROLES } from "../utils/constants.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";

const getLeadTeamMemberIds = async (user) => {
  const team = await Team.findOne({ lead: user._id }).select("members");
  return team?.members?.map((memberId) => String(memberId)) || [String(user._id)];
};

export const createTask = async (req, res) => {
  if (req.user.role === ROLES.TEAM_LEAD) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(req.body.assignedTo))) {
      throw new AppError("Team lead can only assign tasks within their team", StatusCodes.FORBIDDEN);
    }
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    req.body.assignedTo = req.user._id;
    req.body.isDailyTask = true;
  }

  const task = await Task.create({
    ...req.body,
    projectName: req.body.projectName || "General",
    assignedBy: req.user._id,
    dueDate: req.body.dueDate || null
  });

  if (String(task.assignedTo) !== String(req.user._id)) {
    await createNotification({
      recipients: [task.assignedTo],
      title: "New task assigned",
      message: `${req.user.name} assigned you "${task.title}".`,
      type: "task_assigned",
      entityType: "Task",
      entityId: task._id,
      createdBy: req.user._id
    });
  }

  res.status(StatusCodes.CREATED).json({ task });
};

export const getTasks = async (req, res) => {
  const filter = {};

  if (req.user.role === ROLES.EMPLOYEE) {
    filter.assignedTo = req.user._id;
  }

  if (req.user.role === ROLES.TEAM_LEAD) {
    if (req.query.scope === "own") {
      filter.assignedTo = req.user._id;
    } else {
      filter.assignedTo = { $in: await getLeadTeamMemberIds(req.user) };
    }
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.assignedTo) {
    filter.assignedTo = req.query.assignedTo;
  }

  if (req.query.search) {
    filter.$or = [
      { title: { $regex: req.query.search, $options: "i" } },
      { description: { $regex: req.query.search, $options: "i" } },
      { projectName: { $regex: req.query.search, $options: "i" } }
    ];
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter)
  ]);

  res.status(StatusCodes.OK).json({ tasks, ...buildPaginatedResponse({ items: tasks, total, page, limit }) });
};

export const updateTaskStatus = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    throw new AppError("Task not found", StatusCodes.NOT_FOUND);
  }

  if (req.user.role === ROLES.EMPLOYEE && String(task.assignedTo) !== String(req.user._id)) {
    throw new AppError("You can only update your own tasks", StatusCodes.FORBIDDEN);
  }

  if (req.user.role === ROLES.TEAM_LEAD) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(task.assignedTo))) {
      throw new AppError("You can only manage tasks within your team", StatusCodes.FORBIDDEN);
    }
  }

  task.status = req.body.status;
  await task.save();
  await task.populate("assignedTo", "name email");
  await task.populate("assignedBy", "name email");

  const recipients = [task.assignedTo?._id];
  if (task.assignedBy?._id && String(task.assignedBy._id) !== String(task.assignedTo?._id)) {
    recipients.push(task.assignedBy._id);
  }

  await createNotification({
    recipients,
    title: "Task updated",
    message: `${req.user.name} moved "${task.title}" to ${task.status}.`,
    type: "task_updated",
    entityType: "Task",
    entityId: task._id,
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ task });
};
