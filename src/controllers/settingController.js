import { StatusCodes } from "http-status-codes";
import { Setting } from "../models/Setting.js";
import { DEFAULT_ATTENDANCE_POLICY, normalizeAttendancePolicy } from "../utils/attendance.js";

const THEME_KEY = "theme";
const ATTENDANCE_POLICY_KEY = "attendance_policy";
const DEFAULT_PRIMARY_COLOR = "#2563eb";

const getThemeSetting = async () => {
  const setting = await Setting.findOne({ key: THEME_KEY }).lean();
  return {
    primaryColor: setting?.primaryColor || DEFAULT_PRIMARY_COLOR
  };
};

export const getTheme = async (_req, res) => {
  const theme = await getThemeSetting();
  res.status(StatusCodes.OK).json(theme);
};

export const updateTheme = async (req, res) => {
  const setting = await Setting.findOneAndUpdate(
    { key: THEME_KEY },
    {
      key: THEME_KEY,
      primaryColor: req.body.primaryColor
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).lean();

  res.status(StatusCodes.OK).json({
    message: "Theme updated successfully",
    theme: {
      primaryColor: setting.primaryColor
    }
  });
};

const getAttendancePolicySetting = async () => {
  const setting = await Setting.findOne({ key: ATTENDANCE_POLICY_KEY }).lean();
  return normalizeAttendancePolicy(setting?.attendancePolicy || DEFAULT_ATTENDANCE_POLICY);
};

export const getAttendancePolicy = async (_req, res) => {
  const attendancePolicy = await getAttendancePolicySetting();
  res.status(StatusCodes.OK).json({ attendancePolicy });
};

export const updateAttendancePolicy = async (req, res) => {
  const attendancePolicy = normalizeAttendancePolicy(req.body);
  const setting = await Setting.findOneAndUpdate(
    { key: ATTENDANCE_POLICY_KEY },
    {
      key: ATTENDANCE_POLICY_KEY,
      attendancePolicy
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).lean();

  res.status(StatusCodes.OK).json({
    message: "Attendance policy updated successfully",
    attendancePolicy: normalizeAttendancePolicy(setting.attendancePolicy)
  });
};
