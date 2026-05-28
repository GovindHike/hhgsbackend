import { IDLE_THRESHOLD_MINUTES } from "./constants.js";

const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_MINUTES * 60 * 1000;
// Cap elapsed per heartbeat to prevent huge accumulation after server restart / long gap
const MAX_ELAPSED_MS = 5 * 60 * 1000;

// userId (string) → { name, role, team, firstHeartbeatAt, lastHeartbeatAt, activeMs, idleMs, currentStatus }
const activityMap = new Map();

export const recordHeartbeat = (userId, meta, isActive = true) => {
  const now = Date.now();
  const existing = activityMap.get(String(userId));

  if (!existing) {
    activityMap.set(String(userId), {
      ...meta,
      firstHeartbeatAt: new Date(now),
      lastHeartbeatAt: new Date(now),
      activeMs: 0,
      idleMs: 0,
      currentStatus: isActive ? "active" : "idle"
    });
    return;
  }

  const elapsed = Math.min(now - existing.lastHeartbeatAt.getTime(), MAX_ELAPSED_MS);
  let { activeMs, idleMs } = existing;

  if (existing.currentStatus === "active") {
    activeMs += elapsed;
  } else {
    idleMs += elapsed;
  }

  activityMap.set(String(userId), {
    ...existing,
    ...meta,
    lastHeartbeatAt: new Date(now),
    activeMs,
    idleMs,
    currentStatus: isActive ? "active" : "idle"
  });
};

export const removeUser = (userId) => {
  activityMap.delete(String(userId));
};

const computeStatus = (entry) => {
  if (!entry) return "offline";
  return Date.now() - entry.lastHeartbeatAt.getTime() <= IDLE_THRESHOLD_MS
    ? entry.currentStatus || "active"
    : "offline";
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
    status: computeStatus(entry),
    activeMs: entry.activeMs,
    idleMs: entry.idleMs
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
    status: computeStatus(entry),
    activeMs: entry.activeMs,
    idleMs: entry.idleMs
  };
};
