import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { Team } from "../models/Team.js";
import { generateTemporaryPassword } from "../utils/token.js";
import { firstTimePasswordTemplate } from "../utils/emailTemplates.js";
import { sendEmail } from "../services/emailService.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";

const syncTeamMembership = async (userId, nextTeamId) => {
  await Team.updateMany({ members: userId }, { $pull: { members: userId } });

  if (nextTeamId) {
    await Team.findByIdAndUpdate(nextTeamId, { $addToSet: { members: userId } });
  }
};

export const createUser = async (req, res) => {
  const temporaryPassword = generateTemporaryPassword();
  const user = await User.create({
    ...req.body,
    password: temporaryPassword,
    team: req.body.team || null
  });

  if (user.team) {
    await Team.findByIdAndUpdate(user.team, { $addToSet: { members: user._id } });
  }

  const mail = firstTimePasswordTemplate({
    name: user.name,
    email: user.email,
    password: temporaryPassword
  });
  await sendEmail({ to: user.email, ...mail });

  res.status(StatusCodes.CREATED).json({ user });
};

export const getUsers = async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.team) filter.team = req.query.team;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
      { employeeCode: { $regex: req.query.search, $options: "i" } }
    ];
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [users, total] = await Promise.all([
    User.find(filter).populate("team", "name").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  res.status(StatusCodes.OK).json({ users, ...buildPaginatedResponse({ items: users, total, page, limit }) });
};

export const updateUser = async (req, res) => {
  const currentUser = await User.findById(req.params.id);
  if (!currentUser) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  const nextTeam = Object.hasOwn(req.body, "team") ? req.body.team || null : currentUser.team;
  const user = await User.findByIdAndUpdate(req.params.id, { ...req.body, team: nextTeam }, { new: true });

  if (String(currentUser.team || "") !== String(nextTeam || "")) {
    await syncTeamMembership(user._id, nextTeam);
  }

  res.status(StatusCodes.OK).json({ user });
};

export const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  await syncTeamMembership(user._id, null);
  await user.deleteOne();

  res.status(StatusCodes.OK).json({ message: "User deleted successfully" });
};
