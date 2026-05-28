import webpush from "web-push";
import { env } from "../config/env.js";
import { PushSubscription } from "../models/PushSubscription.js";

let isConfigured = false;

export const initializeWebPush = () => {
  if (!env.webPushEnabled) {
    console.warn("[webPush] Disabled. Missing VAPID keys or PUSH_NOTIFICATIONS_ENABLED=false.");
    isConfigured = false;
    return;
  }

  webpush.setVapidDetails(env.webPushVapidSubject, env.webPushVapidPublicKey, env.webPushVapidPrivateKey);
  isConfigured = true;
};

export const getWebPushPublicKey = () => env.webPushVapidPublicKey;

const normalizeSubscriptionPayload = (subscription) => ({
  endpoint: String(subscription?.endpoint || "").trim(),
  expirationTime: subscription?.expirationTime ? new Date(subscription.expirationTime) : null,
  keys: {
    p256dh: String(subscription?.keys?.p256dh || "").trim(),
    auth: String(subscription?.keys?.auth || "").trim()
  }
});

export const savePushSubscription = async ({ userId, subscription, userAgent = "" }) => {
  const payload = normalizeSubscriptionPayload(subscription);

  if (!payload.endpoint || !payload.keys.p256dh || !payload.keys.auth) {
    throw new Error("Invalid push subscription payload");
  }

  await PushSubscription.findOneAndUpdate(
    { user: userId, endpoint: payload.endpoint },
    {
      $set: {
        endpoint: payload.endpoint,
        expirationTime: payload.expirationTime,
        keys: payload.keys,
        userAgent: String(userAgent || ""),
        isActive: true,
        lastSeenAt: new Date()
      },
      $setOnInsert: { user: userId }
    },
    { upsert: true, new: true }
  );
};

export const removePushSubscription = async ({ userId, endpoint }) => {
  const normalizedEndpoint = String(endpoint || "").trim();
  if (!normalizedEndpoint) {
    return;
  }

  await PushSubscription.deleteOne({ user: userId, endpoint: normalizedEndpoint });
};

const deactivateSubscriptionByEndpoint = async (endpoint) => {
  await PushSubscription.updateOne({ endpoint }, { $set: { isActive: false } });
};

const sendToSubscription = async (subscriptionDoc, payload) => {
  const webPushSubscription = {
    endpoint: subscriptionDoc.endpoint,
    expirationTime: subscriptionDoc.expirationTime,
    keys: {
      p256dh: subscriptionDoc.keys.p256dh,
      auth: subscriptionDoc.keys.auth
    }
  };

  try {
    await webpush.sendNotification(webPushSubscription, JSON.stringify(payload), {
      TTL: 60,
      urgency: "normal"
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      await deactivateSubscriptionByEndpoint(subscriptionDoc.endpoint);
      return;
    }

    console.error("[webPush] Failed to send push notification:", error?.message || error);
  }
};

export const sendWebPushToUsers = async ({ userIds = [], payload }) => {
  if (!isConfigured || !Array.isArray(userIds) || !userIds.length) {
    return;
  }

  const normalizedUserIds = [...new Set(userIds.map((id) => String(id)))];
  const subscriptions = await PushSubscription.find({
    user: { $in: normalizedUserIds },
    isActive: true
  }).lean();

  if (!subscriptions.length) {
    return;
  }

  await Promise.all(subscriptions.map((subscription) => sendToSubscription(subscription, payload)));
};
