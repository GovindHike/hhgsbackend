import { StatusCodes } from "http-status-codes";
import dayjs from "dayjs";
import { Task } from "../models/Task.js";
import { Team } from "../models/Team.js";
import { User } from "../models/User.js";
import { TEAM_LEAD_ROLES, EMPLOYEE_ROLES } from "../utils/constants.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import { createNotification } from "../services/notificationService.js";

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

const getLeadTeamMemberIds = async (user) => {
  const team = await Team.findOne({ lead: user._id }).select("lead members");
  const ids = new Set([String(user._id)]);

  if (team?.lead) ids.add(String(team.lead));
  (team?.members || []).forEach((memberId) => ids.add(String(memberId)));

  return Array.from(ids);
};

const assertTaskAccess = async (user, task, actionVerb = "manage") => {
  if (!task) {
    throw new AppError("Task not found", StatusCodes.NOT_FOUND);
  }

  if (EMPLOYEE_ROLES.includes(user.role) && String(task.assignedTo) !== String(user._id)) {
    throw new AppError(`You can only ${actionVerb} your own tasks`, StatusCodes.FORBIDDEN);
  }

  if (TEAM_LEAD_ROLES.includes(user.role)) {
    const memberIds = await getLeadTeamMemberIds(user);
    if (!memberIds.includes(String(task.assignedTo))) {
      throw new AppError(`You can only ${actionVerb} tasks within your team`, StatusCodes.FORBIDDEN);
    }
  }
};

const syncParentTaskStatus = async (parentTaskId) => {
  if (!parentTaskId) return null;

  const [parent, subtasks] = await Promise.all([
    Task.findById(parentTaskId),
    Task.find({ parentTask: parentTaskId }).select("status")
  ]);

  if (!parent) return null;
  if (!subtasks.length) return parent;

  const allCompleted = subtasks.every((subtask) => subtask.status === "Completed");
  if (allCompleted) {
    parent.status = "Completed";
    parent.completedAt = parent.completedAt || new Date();
  } else {
    if (subtasks.some((subtask) => subtask.status === "QA Needed")) parent.status = "QA Needed";
    else if (subtasks.some((subtask) => subtask.status === "In Progress")) parent.status = "In Progress";
    else if (subtasks.some((subtask) => subtask.status === "Ready")) parent.status = "Ready";
    else parent.status = "Backlog";
    parent.completedAt = null;
  }

  await parent.save();
  return parent;
};

const buildSubtaskTreeForTasks = async (topLevelTasks) => {
  const resultTasks = topLevelTasks.map((task) => ({ ...task, subtasks: [] }));
  if (!resultTasks.length) return resultTasks;

  const taskMap = new Map(resultTasks.map((task) => [String(task._id), task]));
  let frontier = resultTasks.map((task) => String(task._id));

  while (frontier.length) {
    const subtaskRows = await Task.find({ parentTask: { $in: frontier } })
      .populate("assignedTo", "name email profilePhotoUrl")
      .populate("assignedBy", "name email profilePhotoUrl")
      .populate("commands.sentBy", "name profilePhotoUrl")
      .sort({ order: 1, createdAt: 1 })
      .lean();

    if (!subtaskRows.length) break;

    const nextFrontier = [];
    subtaskRows.forEach((row) => {
      const node = { ...row, subtasks: [] };
      taskMap.set(String(node._id), node);
      const parent = taskMap.get(String(row.parentTask));
      if (parent) parent.subtasks.push(node);
      nextFrontier.push(String(node._id));
    });

    frontier = nextFrontier;
  }

  return resultTasks;
};

const getScopedTaskFilter = async (req) => {
  const filter = {};
  const onlySubtasks = toBool(req.query.onlySubtasks);

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

  if (req.query.parentTask) {
    filter.parentTask = req.query.parentTask;
  } else if (onlySubtasks) {
    filter.parentTask = { $ne: null };
  } else {
    filter.parentTask = null;
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
    parentTask: req.body.parentTask || null,
    order: typeof req.body.order === "number" ? req.body.order : 0,
    projectName: req.body.projectName || "General",
    assignedBy: req.user._id,
    taskDate: req.body.taskDate,
    dueDate: req.body.dueDate || null,
    completedAt: req.body.status === "Completed" ? new Date() : null
  });

  if (task.parentTask) {
    await syncParentTaskStatus(task.parentTask);
  }

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
  const includeSubtasks = toBool(req.query.includeSubtasks, true) && filter.parentTask === null;

  const { page, limit, skip } = parsePagination(req.query);
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignedTo", "name email profilePhotoUrl")
      .populate("assignedBy", "name email profilePhotoUrl")
      .populate("commands.sentBy", "name profilePhotoUrl")
      .sort({ taskDate: -1, order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter)
  ]);

  const hydratedTasks = includeSubtasks ? await buildSubtaskTreeForTasks(tasks) : tasks;

  res.status(StatusCodes.OK).json({ tasks: hydratedTasks, ...buildPaginatedResponse({ items: hydratedTasks, total, page, limit }) });
};

export const updateTaskStatus = async (req, res) => {
  const task = await Task.findById(req.params.id);
  await assertTaskAccess(req.user, task, "update");

  task.status = req.body.status;
  task.completedAt = req.body.status === "Completed" ? task.completedAt || new Date() : null;
  await task.save();
  if (task.parentTask) await syncParentTaskStatus(task.parentTask);
  await task.populate("assignedTo", "name email profilePhotoUrl");
  await task.populate("assignedBy", "name email profilePhotoUrl");

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
  const rawMessage = String(req.body?.message || "");
  const plainMessage = rawMessage
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainMessage) {
    throw new AppError("Command message is required", StatusCodes.BAD_REQUEST);
  }

  const task = await Task.findById(req.params.id).populate("assignedTo", "name email profilePhotoUrl").populate("assignedBy", "name email profilePhotoUrl");
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
  while ((mentionMatch = mentionRegex.exec(plainMessage)) !== null) {
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
        if (plainMessage.includes(`@${u.name}`) || plainMessage.includes(`@${u.email}`)) {
          recipientsSet.add(String(u._id));
        }
      });
    }
  }

  const recipients = Array.from(recipientsSet).filter((id) => id !== String(req.user._id));
  if (!recipients.length) {
    recipients.push(String(req.user._id));
  }

  task.commands.push({ message: rawMessage, sentBy: req.user._id });
  const createdCommandId = task.commands[task.commands.length - 1]._id;
  await task.save();

  const populatedTask = await Task.findById(task._id)
    .select("commands")
    .populate("commands.sentBy", "name profilePhotoUrl");
  const createdCommand = populatedTask?.commands?.id(createdCommandId) || null;

  await createNotification({
    recipients,
    title: `Task command from ${req.user.name}`,
    message: plainMessage,
    type: "task_command",
    entityType: "Task",
    entityId: task._id,
    referenceId: task._id,
    redirectUrl: "/tasks",
    createdBy: req.user._id
  });

  res.status(StatusCodes.OK).json({ message: "Command sent", command: createdCommand });
};

export const updateTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  await assertTaskAccess(req.user, task, "update");

  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(task.assignedTo))) {
      throw new AppError("You can only update tasks within your team", StatusCodes.FORBIDDEN);
    }
    if (req.body.assignedTo && !memberIds.includes(String(req.body.assignedTo))) {
      throw new AppError("You can only reassign tasks to team members", StatusCodes.FORBIDDEN);
    }
  }

  const { title, description, projectName, taskDate, dueDate, assignedTo, category, status } = req.body;
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (projectName !== undefined) task.projectName = projectName || "General";
  if (taskDate !== undefined) task.taskDate = taskDate;
  if (dueDate !== undefined) task.dueDate = dueDate || null;
  if (category !== undefined) task.category = category;
  if (status !== undefined) {
    task.status = status;
    task.completedAt = status === "Completed" ? task.completedAt || new Date() : null;
  }
  if (req.body.parentTask !== undefined) task.parentTask = req.body.parentTask || null;
  if (req.body.order !== undefined) task.order = req.body.order;
  if (assignedTo !== undefined && !EMPLOYEE_ROLES.includes(req.user.role)) {
    task.assignedTo = assignedTo;
  }

  await task.save();
  if (task.parentTask) await syncParentTaskStatus(task.parentTask);
  await task.populate("assignedTo", "name email profilePhotoUrl");
  await task.populate("assignedBy", "name email profilePhotoUrl");

  res.status(StatusCodes.OK).json({ task });
};

export const deleteTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  await assertTaskAccess(req.user, task, "delete");

  const taskId = String(task._id);
  const toDelete = [taskId];
  let frontier = [taskId];

  while (frontier.length) {
    const children = await Task.find({ parentTask: { $in: frontier } }).select("_id").lean();
    const childIds = children.map((child) => String(child._id));
    if (!childIds.length) break;
    toDelete.push(...childIds);
    frontier = childIds;
  }

  await Task.deleteMany({ _id: { $in: toDelete } });
  if (task.parentTask) await syncParentTaskStatus(task.parentTask);
  res.status(StatusCodes.OK).json({ message: "Task deleted successfully" });
};

export const createSubtask = async (req, res) => {
  const parentTask = await Task.findById(req.params.id);
  await assertTaskAccess(req.user, parentTask, "update");

  let assignedTo = req.body.assignedTo || parentTask.assignedTo;
  if (EMPLOYEE_ROLES.includes(req.user.role)) {
    assignedTo = req.user._id;
  }

  if (TEAM_LEAD_ROLES.includes(req.user.role)) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(assignedTo))) {
      throw new AppError("You can only assign subtasks within your team", StatusCodes.FORBIDDEN);
    }
  }

  const maxOrderRow = await Task.findOne({ parentTask: parentTask._id }).sort({ order: -1 }).select("order").lean();
  const nextOrder = typeof maxOrderRow?.order === "number" ? maxOrderRow.order + 1 : 1;

  const subtask = await Task.create({
    title: req.body.title,
    description: req.body.description || "",
    projectName: req.body.projectName || parentTask.projectName || "General",
    assignedTo,
    assignedBy: req.user._id,
    status: req.body.status || "Backlog",
    category: req.body.category || parentTask.category || "Feature",
    taskDate: req.body.taskDate || parentTask.taskDate || new Date(),
    dueDate: req.body.dueDate || parentTask.dueDate || null,
    parentTask: parentTask._id,
    order: req.body.order ?? nextOrder,
    completedAt: req.body.status === "Completed" ? new Date() : null
  });

  await syncParentTaskStatus(parentTask._id);
  await subtask.populate("assignedTo", "name email profilePhotoUrl");
  await subtask.populate("assignedBy", "name email profilePhotoUrl");

  res.status(StatusCodes.CREATED).json({ subtask });
};

export const updateSubtask = async (req, res) => {
  const subtask = await Task.findById(req.params.subtaskId);
  if (!subtask || String(subtask.parentTask) !== String(req.params.id)) {
    throw new AppError("Subtask not found", StatusCodes.NOT_FOUND);
  }

  await assertTaskAccess(req.user, subtask, "update");

  if (TEAM_LEAD_ROLES.includes(req.user.role) && req.body.assignedTo) {
    const memberIds = await getLeadTeamMemberIds(req.user);
    if (!memberIds.includes(String(req.body.assignedTo))) {
      throw new AppError("You can only reassign subtasks to team members", StatusCodes.FORBIDDEN);
    }
  }

  const { title, description, projectName, taskDate, dueDate, assignedTo, category, status, order } = req.body;
  if (title !== undefined) subtask.title = title;
  if (description !== undefined) subtask.description = description;
  if (projectName !== undefined) subtask.projectName = projectName || "General";
  if (taskDate !== undefined) subtask.taskDate = taskDate;
  if (dueDate !== undefined) subtask.dueDate = dueDate || null;
  if (category !== undefined) subtask.category = category;
  if (status !== undefined) {
    subtask.status = status;
    subtask.completedAt = status === "Completed" ? subtask.completedAt || new Date() : null;
  }
  if (order !== undefined) subtask.order = order;
  if (assignedTo !== undefined && !EMPLOYEE_ROLES.includes(req.user.role)) {
    subtask.assignedTo = assignedTo;
  }

  await subtask.save();
  await syncParentTaskStatus(subtask.parentTask);
  await subtask.populate("assignedTo", "name email profilePhotoUrl");
  await subtask.populate("assignedBy", "name email profilePhotoUrl");

  res.status(StatusCodes.OK).json({ subtask });
};

export const toggleSubtask = async (req, res) => {
  const subtask = await Task.findById(req.params.subtaskId);
  if (!subtask || String(subtask.parentTask) !== String(req.params.id)) {
    throw new AppError("Subtask not found", StatusCodes.NOT_FOUND);
  }

  await assertTaskAccess(req.user, subtask, "update");

  const isCompleted = subtask.status === "Completed";
  subtask.status = isCompleted ? "Backlog" : "Completed";
  subtask.completedAt = subtask.status === "Completed" ? new Date() : null;
  await subtask.save();

  await syncParentTaskStatus(subtask.parentTask);
  await subtask.populate("assignedTo", "name email profilePhotoUrl");
  await subtask.populate("assignedBy", "name email profilePhotoUrl");

  res.status(StatusCodes.OK).json({ subtask });
};

export const reorderSubtasks = async (req, res) => {
  const parentTask = await Task.findById(req.params.id);
  await assertTaskAccess(req.user, parentTask, "update");

  const updates = Array.isArray(req.body.orders) ? req.body.orders : [];
  if (!updates.length) {
    throw new AppError("Subtask order updates are required", StatusCodes.BAD_REQUEST);
  }

  const ids = updates.map((item) => item.id);
  const subtasks = await Task.find({ _id: { $in: ids }, parentTask: parentTask._id }).select("_id");
  if (subtasks.length !== ids.length) {
    throw new AppError("One or more subtasks are invalid", StatusCodes.BAD_REQUEST);
  }

  await Promise.all(
    updates.map((item) => Task.updateOne({ _id: item.id, parentTask: parentTask._id }, { $set: { order: Number(item.order) || 0 } }))
  );

  const orderedSubtasks = await Task.find({ parentTask: parentTask._id })
    .populate("assignedTo", "name email profilePhotoUrl")
    .populate("assignedBy", "name email profilePhotoUrl")
    .sort({ order: 1, createdAt: 1 })
    .lean();

  res.status(StatusCodes.OK).json({ subtasks: orderedSubtasks });
};

export const deleteSubtask = async (req, res) => {
  const subtask = await Task.findById(req.params.subtaskId);
  if (!subtask || String(subtask.parentTask) !== String(req.params.id)) {
    throw new AppError("Subtask not found", StatusCodes.NOT_FOUND);
  }

  await assertTaskAccess(req.user, subtask, "delete");

  const rootId = String(subtask._id);
  const toDelete = [rootId];
  let frontier = [rootId];

  while (frontier.length) {
    const children = await Task.find({ parentTask: { $in: frontier } }).select("_id").lean();
    const childIds = children.map((child) => String(child._id));
    if (!childIds.length) break;
    toDelete.push(...childIds);
    frontier = childIds;
  }

  await Task.deleteMany({ _id: { $in: toDelete } });
  await syncParentTaskStatus(subtask.parentTask);

  res.status(StatusCodes.OK).json({ message: "Subtask deleted", deletedSubtaskId: rootId });
};

export const editCommand = async (req, res) => {
  const rawMessage = String(req.body?.message || "");
  const plainMessage = rawMessage
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plainMessage) throw new AppError("Command message is required", StatusCodes.BAD_REQUEST);

  const task = await Task.findById(req.params.id);
  if (!task) throw new AppError("Task not found", StatusCodes.NOT_FOUND);

  const cmd = task.commands.id(req.params.commandId);
  if (!cmd) throw new AppError("Command not found", StatusCodes.NOT_FOUND);

  const isOwner = String(cmd.sentBy) === String(req.user._id);
  if (!isOwner) {
    throw new AppError("You can only edit your own commands", StatusCodes.FORBIDDEN);
  }

  cmd.message = rawMessage;
  await task.save();

  const populatedTask = await Task.findById(task._id)
    .select("commands")
    .populate("commands.sentBy", "name profilePhotoUrl");
  const updatedCommand = populatedTask?.commands?.id(req.params.commandId) || null;

  res.status(StatusCodes.OK).json({ message: "Command updated", command: updatedCommand });
};

export const deleteCommand = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw new AppError("Task not found", StatusCodes.NOT_FOUND);

  const cmd = task.commands.id(req.params.commandId);
  if (!cmd) throw new AppError("Command not found", StatusCodes.NOT_FOUND);

  const isOwner = String(cmd.sentBy) === String(req.user._id);
  if (!isOwner) {
    throw new AppError("You can only delete your own commands", StatusCodes.FORBIDDEN);
  }

  const deletedCommandId = String(cmd._id);
  cmd.deleteOne();
  await task.save();
  res.status(StatusCodes.OK).json({ message: "Command deleted", deletedCommandId });
};

export const reactToCommand = async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) throw new AppError("Emoji is required", StatusCodes.BAD_REQUEST);

  const task = await Task.findById(req.params.id);
  if (!task) throw new AppError("Task not found", StatusCodes.NOT_FOUND);

  const cmd = task.commands.id(req.params.commandId);
  if (!cmd) throw new AppError("Command not found", StatusCodes.NOT_FOUND);

  const uid = String(req.user._id);
  const users = (cmd.reactions.get(emoji) || []).map(String);
  const idx = users.indexOf(uid);

  if (idx === -1) {
    users.push(uid);
  } else {
    users.splice(idx, 1);
  }

  if (users.length === 0) {
    cmd.reactions.delete(emoji);
  } else {
    cmd.reactions.set(emoji, users);
  }

  await task.save();

  const reactions = {};
  cmd.reactions.forEach((v, k) => { reactions[k] = v.map(String); });
  res.status(StatusCodes.OK).json({ reactions });
};
