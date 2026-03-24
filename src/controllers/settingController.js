import { StatusCodes } from "http-status-codes";
import { Setting } from "../models/Setting.js";

const THEME_KEY = "theme";
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
