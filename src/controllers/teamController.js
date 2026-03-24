import { StatusCodes } from "http-status-codes";
import { Team } from "../models/Team.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";

const syncTeamUsers = async (teamId, members = [], lead = null) => {
  const uniqueMemberIds = [...new Set([...(members || []), ...(lead ? [lead] : [])])];
  await User.updateMany({ team: teamId, _id: { $nin: uniqueMemberIds } }, { $set: { team: null } });
  if (uniqueMemberIds.length) {
    await User.updateMany({ _id: { $in: uniqueMemberIds } }, { $set: { team: teamId } });
  }
};

export const createTeam = async (req, res) => {
  const team = await Team.create({
    ...req.body,
    lead: req.body.lead || null,
    members: req.body.members || []
  });

  await syncTeamUsers(team._id, team.members, team.lead);
  res.status(StatusCodes.CREATED).json({ team });
};

export const getTeams = async (req, res) => {
  const filter = req.query.search
    ? { name: { $regex: req.query.search, $options: "i" } }
    : {};
  const { page, limit, skip } = parsePagination(req.query);

  const [teams, total] = await Promise.all([
    Team.find(filter)
      .populate("lead", "name email role")
      .populate("members", "name email role employeeCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Team.countDocuments(filter)
  ]);
  res.status(StatusCodes.OK).json({ teams, ...buildPaginatedResponse({ items: teams, total, page, limit }) });
};

export const updateTeam = async (req, res) => {
  const team = await Team.findByIdAndUpdate(
    req.params.id,
    { ...req.body, lead: req.body.lead || null },
    { new: true }
  );

  if (!team) {
    throw new AppError("Team not found", StatusCodes.NOT_FOUND);
  }

  await syncTeamUsers(team._id, req.body.members ?? team.members, req.body.lead ?? team.lead);
  res.status(StatusCodes.OK).json({ team });
};
