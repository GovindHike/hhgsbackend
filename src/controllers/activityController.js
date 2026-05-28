import { StatusCodes } from "http-status-codes";
import { getAllStatuses } from "../utils/activityTracker.js";
import { isTeamLeadRole } from "../utils/constants.js";
import { Attendance } from "../models/Attendance.js";
import dayjs from "dayjs";

export const getActivityStatuses = async (req, res) => {
  const todayStr = dayjs().format("YYYY-MM-DD");

  // Fetch all attendance records for today
  const todayAttendances = await Attendance.find({ date: todayStr })
    .populate("user", "_id name role team")
    .lean();

  // Only keep records with an active (open) session
  const checkedInAttendances = todayAttendances.filter((a) => {
    const last = a.sessions?.at(-1);
    return last && !last.checkOut;
  });

  // Build a map from activity tracker
  const activityStatuses = getAllStatuses();
  const activityByUserId = new Map(activityStatuses.map((s) => [s.userId, s]));

  // Merge attendance + activity data
  let statuses = checkedInAttendances.map((a) => {
    const userId = String(a.user._id);
    const activity = activityByUserId.get(userId);
    const lastSession = a.sessions.at(-1);

    return {
      userId,
      name: a.user.name,
      role: a.user.role,
      team: a.user.team ? String(a.user.team) : null,
      checkedInAt: lastSession?.checkIn || null,
      lastSeenAt: activity?.lastSeenAt || null,
      status: activity?.status || "offline",
      activeMs: activity?.activeMs ?? 0,
      idleMs: activity?.idleMs ?? 0
    };
  });

  // Add any socket-active users not in today's attendance (edge case)
  activityStatuses.forEach((s) => {
    if (!statuses.some((u) => u.userId === s.userId)) {
      statuses.push({ ...s, checkedInAt: null });
    }
  });

  if (isTeamLeadRole(req.user.role)) {
    const teamId = String(req.user.team?._id || req.user.team || "");
    if (teamId) {
      statuses = statuses.filter((s) => String(s.team || "") === teamId);
    }
  }

  res.status(StatusCodes.OK).json({ statuses });
};
