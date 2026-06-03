import { StatusCodes } from "http-status-codes";
import { AppError } from "../utils/AppError.js";
import { getLinkedInRuntimeConfig, postImageToLinkedIn } from "../services/linkedInService.js";

export const postToLinkedIn = async (req, res) => {
  const caption = String(req.body?.caption || "").trim();

  if (!req.file) {
    throw new AppError("photo file is required", StatusCodes.BAD_REQUEST);
  }

  const runtime = await getLinkedInRuntimeConfig();
  if (!runtime.accessToken || !runtime.personId) {
    throw new AppError(
      "LinkedIn is not configured. Connect your account first so token and person ID are available.",
      StatusCodes.BAD_REQUEST
    );
  }

  const result = await postImageToLinkedIn({
    accessToken: runtime.accessToken,
    personId: runtime.personId,
    caption,
    imageBuffer: req.file.buffer,
    mimeType: req.file.mimetype,
  });

  return res.status(StatusCodes.OK).json({
    success: true,
    postId: result.postId,
    postUrl: result.postUrl,
  });
};
