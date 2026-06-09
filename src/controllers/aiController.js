import { StatusCodes } from "http-status-codes";
import {
  fetchHealthcareNews,
  generateLinkedInPost,
  generatePostImage,
  downloadImageBuffer,
} from "../services/aiService.js";
import {
  postImageToLinkedIn,
  getLinkedInRuntimeConfig,
} from "../services/linkedInService.js";

export const getNews = async (req, res) => {
  const topics = req.query.topics
    ? String(req.query.topics).split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const page = Math.max(1, parseInt(req.query.page) || 1);

  const articles = await fetchHealthcareNews(topics, page);
  res.json({ articles, total: articles.length });
};

export const generatePost = async (req, res) => {
  const { title, description, source } = req.body;
  if (!title) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Article title is required" });
  }

  const postText = await generateLinkedInPost({
    title,
    description: description || "",
    source: source || "Unknown",
  });
  res.json({ postText });
};

export const generateImage = async (req, res) => {
  const { articleTitle } = req.body;
  if (!articleTitle) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Article title is required" });
  }

  const imageUrl = await generatePostImage(articleTitle);
  res.json({ imageUrl });
};

export const publishPost = async (req, res) => {
  const { postText, imageUrl } = req.body;

  if (!postText) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Post text is required" });
  }
  if (!imageUrl) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Image URL is required" });
  }

  const config = await getLinkedInRuntimeConfig();
  if (!config.configured) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message:
        "LinkedIn is not configured. Please connect your LinkedIn account in the Celebrations settings.",
    });
  }

  const imageBuffer = await downloadImageBuffer(imageUrl);

  // Derive MIME type from data URL header or default to JPEG
  let mimeType = "image/jpeg";
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);/);
    if (match) mimeType = match[1];
  }

  const result = await postImageToLinkedIn({
    accessToken: config.accessToken,
    personId: config.personId,
    caption: postText,
    imageBuffer,
    mimeType,
  });

  res.json({
    success: true,
    postId: result.postId,
    postUrl: result.postUrl,
  });
};
