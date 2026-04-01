import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { Team } from "../models/Team.js";
import { generateTemporaryPassword } from "../utils/token.js";
import { firstTimePasswordTemplate } from "../utils/emailTemplates.js";
import { sendEmail } from "../services/emailService.js";
import { AppError } from "../utils/AppError.js";
import { ADMIN_ROLES, TEAM_LEAD_ROLES, EMPLOYEE_ROLES } from "../utils/constants.js";
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

  sendEmail({ to: user.email, ...mail }).catch((error) => {
    console.error(`Failed to send first-time password email to ${user.email}:`, error.message);
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: user
  });
};

export const getUsers = async (req, res) => {
  const filter = {};
  if (req.query.role) {
    const roleValue = req.query.role;
    if (ADMIN_ROLES.includes(roleValue)) {
      filter.role = { $in: ADMIN_ROLES };
    } else if (TEAM_LEAD_ROLES.includes(roleValue)) {
      filter.role = { $in: TEAM_LEAD_ROLES };
    } else if (EMPLOYEE_ROLES.includes(roleValue)) {
      filter.role = { $in: EMPLOYEE_ROLES };
    } else {
      filter.role = roleValue;
    }
  }
  if (req.query.team) filter.team = req.query.team;

  const searchValue = req.query.employeeCodeRange?.trim() || req.query.search?.trim();
  const rangeMatch = searchValue?.match(/^HHGS-(\d+)\s*-\s*(?:HHGS-)?(\d+)$/i);

  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);

    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      const [min, max] = start <= end ? [start, end] : [end, start];
      filter.employeeCode = { $regex: /^HHGS-\d+$/i };
      filter.$expr = {
        $and: [
          {
            $gte: [
              {
                $toInt: {
                  $arrayElemAt: [{ $split: ["$employeeCode", "-"] }, 1]
                }
              },
              min
            ]
          },
          {
            $lte: [
              {
                $toInt: {
                  $arrayElemAt: [{ $split: ["$employeeCode", "-"] }, 1]
                }
              },
              max
            ]
          }
        ]
      };
    }
  } else if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
      { employeeCode: { $regex: req.query.search, $options: "i" } }
    ];
  }

  const { page, limit, skip } = parsePagination(req.query);

  const usersAll = await User.find(filter)
    .populate("team", "name")
    .lean();

  const parseCodeNum = (code) => {
    const match = String(code || "").match(/HHGS-(\d+)/i);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const sortedAll = usersAll.sort((a, b) => {
    const aNum = parseCodeNum(a.employeeCode);
    const bNum = parseCodeNum(b.employeeCode);
    if (aNum !== bNum) return aNum - bNum;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });

  const pagedUsers = sortedAll.slice(skip, skip + limit);

  res.status(StatusCodes.OK).json({
    users: pagedUsers,
    ...buildPaginatedResponse({
      items: pagedUsers,
      total: sortedAll.length,
      page,
      limit
    })
  });
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

export const getMentionUsers = async (req, res) => {
  const filter = {};

  if (req.query.q) {
    const query = req.query.q.trim();
    filter.$or = [
      { name: { $regex: query, $options: "i" } },
      { email: { $regex: query, $options: "i" } }
    ];
  }

  const users = await User.find(filter, "_id name email").sort({ name: 1 }).lean();
  res.status(StatusCodes.OK).json({ users });
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
