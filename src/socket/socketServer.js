import { Server } from "socket.io";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/token.js";

let io;
const userSockets = new Map();

const addSocketForUser = (userId, socketId) => {
  const existing = userSockets.get(userId) || new Set();
  existing.add(socketId);
  userSockets.set(userId, existing);
};

const removeSocketForUser = (userId, socketId) => {
  const existing = userSockets.get(userId);
  if (!existing) {
    return;
  }

  existing.delete(socketId);
  if (!existing.size) {
    userSockets.delete(userId);
  }
};

const getTokenFromHandshake = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (authToken) {
    return authToken;
  }

  const header = socket.handshake.headers?.authorization;
  return header?.startsWith("Bearer ") ? header.split(" ")[1] : null;
};

export const initSocketServer = (httpServer, clientUrl) => {
  io = new Server(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromHandshake(socket);
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id).select("_id name role isActive");
      if (!user || !user.isActive) {
        return next(new Error("Unauthorized"));
      }

      socket.user = {
        id: String(user._id),
        name: user.name,
        role: user.role
      };

      return next();
    } catch (_error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    addSocketForUser(userId, socket.id);
    socket.join(`user:${userId}`);

    socket.on("disconnect", () => {
      removeSocketForUser(userId, socket.id);
    });
  });

  return io;
};

export const getSocketServer = () => io;

export const sendNotification = (userIds = [], payload) => {
  if (!io) {
    return;
  }

  const recipients = [...new Set(userIds.map((id) => String(id)))];
  recipients.forEach((userId) => {
    io.to(`user:${userId}`).emit(payload.type, payload);
    io.to(`user:${userId}`).emit("notification:new", payload);
  });
};

export const getConnectedUsers = () =>
  [...userSockets.entries()].map(([userId, socketIds]) => ({
    userId,
    socketIds: [...socketIds]
  }));
