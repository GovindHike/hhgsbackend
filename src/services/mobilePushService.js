import { env } from "../config/env.js";
import { MobilePushToken } from "../models/MobilePushToken.js";

const EXPO_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;
const EXPO_MAX_BATCH_SIZE = 100;

const chunk = (items, size) => {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
};

const isExpoPushToken = (token) => EXPO_TOKEN_REGEX.test(String(token || "").trim());

export const saveMobilePushToken = async ({ userId, token, provider = "expo", platform = "unknown", app = "mobile" }) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new Error("Push token is required");
  }

  await MobilePushToken.findOneAndUpdate(
    { token: normalizedToken },
    {
      $set: {
        user: userId,
        token: normalizedToken,
        provider: String(provider || "expo").toLowerCase(),
        platform: String(platform || "unknown").toLowerCase(),
        app: String(app || "mobile").toLowerCase(),
        isActive: true,
        lastSeenAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

export const removeMobilePushToken = async ({ userId, token }) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return;
  }

  await MobilePushToken.deleteOne({ user: userId, token: normalizedToken });
};

const deactivateInvalidTokens = async (tokens = []) => {
  if (!tokens.length) {
    return;
  }

  await MobilePushToken.updateMany({ token: { $in: tokens } }, { $set: { isActive: false } });
};

const sendExpoMessages = async (messages) => {
  const response = await fetch(env.expoPushApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate"
    },
    body: JSON.stringify(messages)
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Expo push API failed (${response.status}): ${bodyText}`);
  }

  const json = await response.json();
  return Array.isArray(json?.data) ? json.data : [];
};

export const sendMobilePushToUsers = async ({ userIds = [], payload }) => {
  if (!env.mobilePushEnabled || !Array.isArray(userIds) || !userIds.length) {
    return;
  }

  const normalizedUserIds = [...new Set(userIds.map((id) => String(id)))];
  const tokenDocs = await MobilePushToken.find({
    user: { $in: normalizedUserIds },
    isActive: true
  }).lean();

  if (!tokenDocs.length) {
    return;
  }

  const expoTokens = tokenDocs
    .map((doc) => String(doc.token || "").trim())
    .filter((token) => isExpoPushToken(token));

  if (!expoTokens.length) {
    return;
  }

  const messages = expoTokens.map((token) => ({
    to: token,
    title: payload?.title || "HHGS Office Management",
    body: payload?.body || "You have a new notification.",
    sound: "default",
    priority: "high",
    channelId: "default",
    data: {
      type: payload?.type || "notification",
      redirectUrl: payload?.redirectUrl || "/",
      notificationId: payload?.notificationId || "",
      tag: payload?.tag || ""
    }
  }));

  const invalidTokens = [];
  const batches = chunk(messages, EXPO_MAX_BATCH_SIZE);

  for (const batch of batches) {
    try {
      const tickets = await sendExpoMessages(batch);
      tickets.forEach((ticket, index) => {
        if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(batch[index]?.to);
        }
      });
    } catch (error) {
      console.error("[mobilePush] Failed to send Expo push notifications:", error?.message || error);
    }
  }

  await deactivateInvalidTokens(invalidTokens.filter(Boolean));
};
