import { IDLE_THRESHOLD_MINUTES } from "./constants.js";

const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_MINUTES * 60 * 1000;

// userId (string) → { name, role, team, lastHeartbeatAt: Date }
const activityMap = new Map();

export const recordHeartbeat = (userId, meta) => {
  const existing = activityMap.get(String(userId)) || {};
  activityMap.set(String(userId), {
    ...existing,
    ...meta,
    lastHeartbeatAt: new Date()
  });
};

export const removeUser = (userId) => {
  activityMap.delete(String(userId));
};

const computeStatus = (entry) => {
  if (!entry) return "offline";
  return Date.now() - entry.lastHeartbeatAt.getTime() <= IDLE_THRESHOLD_MS ? "active" : "idle";
};

export const getUserStatus = (userId) => {
  const entry = activityMap.get(String(userId));
  return computeStatus(entry);
};

export const getAllStatuses = () =>
  [...activityMap.entries()].map(([userId, entry]) => ({
    userId,
    name: entry.name,
    role: entry.role,
    team: entry.team,
    lastSeenAt: entry.lastHeartbeatAt,
    status: computeStatus(entry)
  }));

export const buildStatusPayload = (userId) => {
  const entry = activityMap.get(String(userId));
  if (!entry) return { userId: String(userId), status: "offline" };
  return {
    userId: String(userId),
    name: entry.name,
    role: entry.role,
    team: entry.team,
    lastSeenAt: entry.lastHeartbeatAt,
    status: computeStatus(entry)
  };
};
