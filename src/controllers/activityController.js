import { StatusCodes } from "http-status-codes";
import { getAllStatuses } from "../utils/activityTracker.js";
import { isTeamLeadRole } from "../utils/constants.js";

export const getActivityStatuses = (req, res) => {
  let statuses = getAllStatuses();

  if (isTeamLeadRole(req.user.role)) {
    const teamId = String(req.user.team?._id || req.user.team || "");
    if (teamId) {
      statuses = statuses.filter((s) => String(s.team || "") === teamId);
    }
  }

  res.status(StatusCodes.OK).json({ statuses });
};
