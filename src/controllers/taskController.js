import { StatusCodes } from "http-status-codes";
import dayjs from "dayjs";
import { Task } from "../models/Task.js";
import { Team } from "../models/Team.js";
import { User } from "../models/User.js";
import { TEAM_LEAD_ROLES, EMPLOYEE_ROLES } from "../utils/constants.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";

const getLeadTeamMemberIds = async (user) => {
  const team = await Team.findOne({ lead: user._id }).select("members");
  return team?.members?.map((memberId) => String(memberId)) || [String(user._id)];
};

const getScopedTaskFilter = async (req) => {
  const filter = {};

  // Allow explicit full-scope view for any role
  if (req.query.scope !== "all") {
    if (EMPLOYEE_ROLES.includes(req.user.role)) {
      filter.assignedTo = req.user._id;
    }

    if (TEAM_LEAD_ROLES.includes(req.user.role)) {
      if (req.query.scope === "own") {
        filter.assignedTo = req.user._id;
      } else {
        filter.assignedTo = { $in: await getLeadTeamMemberIds(req.user) };
      }
    }
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const employeeId = req.query.employeeId || req.query.assignedTo;
  if (employeeId) {
    if (EMPLOYEE_ROLES.includes(req.user.role) && String(employeeId) !== String(req.user._id)) {
      throw new AppError("You can only filter your own tasks", StatusCodes.FORBIDDEN);
    }

    if (TEAM_LEAD_ROLES.includes(req.user.role)) {
      const memberIds = await getLeadTeamMemberIds(req.user);
      if (!memberIds.includes(String(employeeId))) {
        throw new AppError("You can only filter tasks within your team", StatusCodes.FORBIDDEN);
      }
    }

    filter.assignedTo = employeeId;
  }

  if (req.query.taskDate) {
    const date = dayjs(req.query.taskDate);
    if (date.isValid()) {
      filter.taskDate = {
        $gte: date.startOf("day").toDate(),
        $lte: date.endOf("day").toDate()
      };
    }
  }

  if (req.query.dateFrom || req.query.dateTo) {
    filter.taskDate = {
      ...(filter.taskDate || {}),
      ...(req.query.dateFrom ? { $gte: dayjs(req.query.dateFrom).startOf("day").toDate() } : {}),
      ...(req.query.dateTo ? { $lte: dayjs(req.query.dateTo).endOf("day").toDate() } : {})
    };
  }

  if (req.query.search) {
    filter.$or = [
      { title: { $regex: req.query.search, $options: "i" } },
      { description: { $regex: req.query.search, $options: "i" } },
      { projectName: { $regex: req.query.search, $options: "i" } }
    ];
  }

  return filter;
};

export const createTask = async (req, res) => {
  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(req.body.assignedTo))) {
      throw new AppError("Team lead can only assign tasks within their team", StatusCodes.FORBIDDEN);
    }
  }

  if (EMPLOYEE_ROLES.includes(req.user.role)) {
    req.body.assignedTo = req.user._id;
    req.body.isDailyTask = true;
  }

  const task = await Task.create({
    ...req.body,
    projectName: req.body.projectName || "General",
    assignedBy: req.user._id,
    taskDate: req.body.taskDate,
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
      referenceId: task._id,
      redirectUrl: "/tasks",
      createdBy: req.user._id
    });
  }

  res.status(StatusCodes.CREATED).json({ task });
};

export const getTasks = async (req, res) => {
  const filter = await getScopedTaskFilter(req);

  const { page, limit, skip } = parsePagination(req.query);
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .populate("commands.sentBy", "name")
      .sort({ taskDate: -1, createdAt: -1 })
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

  if (EMPLOYEE_ROLES.includes(req.user.role) && String(task.assignedTo) !== String(req.user._id)) {
    throw new AppError("You can only update your own tasks", StatusCodes.FORBIDDEN);
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
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
    referenceId: task._id,
    redirectUrl: "/tasks",
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ task });
};

export const commandTask = async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    throw new AppError("Command message is required", StatusCodes.BAD_REQUEST);
  }

  const task = await Task.findById(req.params.id).populate("assignedTo", "name email").populate("assignedBy", "name email");
  if (!task) {
    throw new AppError("Task not found", StatusCodes.NOT_FOUND);
  }

  if (EMPLOYEE_ROLES.includes(req.user.role) && String(task.assignedTo?._id) !== String(req.user._id)) {
    throw new AppError("You can only command your own tasks", StatusCodes.FORBIDDEN);
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(task.assignedTo?._id)) && String(task.assignedTo?._id) !== String(req.user._id)) {
      throw new AppError("You can only command tasks within your team", StatusCodes.FORBIDDEN);
    }
  }

  const recipientsSet = new Set();
  if (task.assignedTo?._id) recipientsSet.add(String(task.assignedTo._id));
  if (task.assignedBy?._id) recipientsSet.add(String(task.assignedBy._id));

  // resolve @mentions for both exact names/emails and partial matches
  const mentionTokens = [];
  const mentionRegex = /@([^@\s][^@]*)/g;
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(message)) !== null) {
    const token = mentionMatch[1].trim().replace(/[.,;!?]+$/g, "");
    if (token) mentionTokens.push(token);
  }

  if (mentionTokens.length) {
    const uniqueTokens = [...new Set(mentionTokens)];

    const queryOr = [];
    uniqueTokens.forEach((token) => {
      queryOr.push({ name: token });
      queryOr.push({ email: token });
    });

    let mentionResolved = false;
    if (queryOr.length) {
      const mentionedUsers = await User.find({ $or: queryOr }).select("_id").lean();
      mentionedUsers.forEach((u) => recipientsSet.add(String(u._id)));
      mentionResolved = mentionedUsers.length > 0;
    }

    // fallback for names with spaces or non-standard characters
    if (!mentionResolved && uniqueTokens.length) {
      const allUsers = await User.find({}, "_id name email").lean();
      allUsers.forEach((u) => {
        if (message.includes(`@${u.name}`) || message.includes(`@${u.email}`)) {
          recipientsSet.add(String(u._id));
        }
      });
    }
  }

  const recipients = Array.from(recipientsSet).filter((id) => id !== String(req.user._id));
  if (!recipients.length) {
    recipients.push(String(req.user._id));
  }

  task.commands.push({ message, sentBy: req.user._id });
  await task.save();

  await createNotification({
    recipients,
    title: `Task command from ${req.user.name}`,
    message: message,
    type: "task_command",
    entityType: "Task",
    entityId: task._id,
    referenceId: task._id,
    redirectUrl: "/tasks",
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ message: "Command sent" });
};

export const updateTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    throw new AppError("Task not found", StatusCodes.NOT_FOUND);
  }

  if (EMPLOYEE_ROLES.includes(req.user.role) && String(task.assignedTo) !== String(req.user._id)) {
    throw new AppError("You can only update your own tasks", StatusCodes.FORBIDDEN);
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(task.assignedTo))) {
      throw new AppError("You can only update tasks within your team", StatusCodes.FORBIDDEN);
    }
    if (req.body.assignedTo && !memberIds.includes(String(req.body.assignedTo))) {
      throw new AppError("You can only reassign tasks to team members", StatusCodes.FORBIDDEN);
    }
  }

  const { title, description, projectName, taskDate, dueDate, assignedTo } = req.body;
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (projectName !== undefined) task.projectName = projectName || "General";
  if (taskDate !== undefined) task.taskDate = taskDate;
  if (dueDate !== undefined) task.dueDate = dueDate || null;
  if (assignedTo !== undefined && !EMPLOYEE_ROLES.includes(req.user.role)) {
    task.assignedTo = assignedTo;
  }

  await task.save();
  await task.populate("assignedTo", "name email");
  await task.populate("assignedBy", "name email");

  res.status(StatusCodes.OK).json({ task });
};

export const deleteTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    throw new AppError("Task not found", StatusCodes.NOT_FOUND);
  }

  if (EMPLOYEE_ROLES.includes(req.user.role) && String(task.assignedTo) !== String(req.user._id)) {
    throw new AppError("You can only delete your own tasks", StatusCodes.FORBIDDEN);
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(task.assignedTo))) {
      throw new AppError("You can only delete tasks within your team", StatusCodes.FORBIDDEN);
    }
  }

  await task.deleteOne();
  res.status(StatusCodes.OK).json({ message: "Task deleted successfully" });
};

export const editCommand = async (req, res) => {
  const { message } = req.body;
  const task = await Task.findById(req.params.id);
  if (!task) throw new AppError("Task not found", StatusCodes.NOT_FOUND);

  const cmd = task.commands.id(req.params.commandId);
  if (!cmd) throw new AppError("Command not found", StatusCodes.NOT_FOUND);

  const isOwner = String(cmd.sentBy) === String(req.user._id);
  const isPrivileged = TEAM_LEAD_ROLES.includes(req.user.role) || req.user.role === "admin";
  if (!isOwner && !isPrivileged) {
    throw new AppError("You can only edit your own commands", StatusCodes.FORBIDDEN);
  }

  cmd.message = message.trim();
  await task.save();
  res.status(StatusCodes.OK).json({ message: "Command updated" });
};

export const deleteCommand = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw new AppError("Task not found", StatusCodes.NOT_FOUND);

  const cmd = task.commands.id(req.params.commandId);
  if (!cmd) throw new AppError("Command not found", StatusCodes.NOT_FOUND);

  const isOwner = String(cmd.sentBy) === String(req.user._id);
  const isPrivileged = TEAM_LEAD_ROLES.includes(req.user.role) || req.user.role === "admin";
  if (!isOwner && !isPrivileged) {
    throw new AppError("You can only delete your own commands", StatusCodes.FORBIDDEN);
  }

  cmd.deleteOne();
  await task.save();
  res.status(StatusCodes.OK).json({ message: "Command deleted" });
};
