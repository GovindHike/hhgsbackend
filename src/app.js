import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import "express-async-errors";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import { env } from "./config/env.js";

const getRetryAfterSeconds = (req) => {
  const resetTime = req.rateLimit?.resetTime;

  if (!(resetTime instanceof Date)) {
    return undefined;
  }

  return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
};

export const createApp = () => {
  const app = express();
  app.set("trust proxy", env.trustProxyHops);

  const allowedOrigins = [env.frontendUrl].filter(Boolean);
  const corsOptions = {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`Blocked CORS request from origin: ${origin}`);
      return callback(new Error("CORS not allowed"));
    },
    credentials: true,
    optionsSuccessStatus: 204
  };

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    rateLimit({
      windowMs: env.rateLimitWindowMs,
      limit: env.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method === "OPTIONS" || req.path === "/health" || req.path.startsWith("/api/auth"),
      handler: (req, res) => {
        res.status(429).json({
          message: "Too many requests, please try again later.",
          retryAfterSeconds: getRetryAfterSeconds(req)
        });
      }
    })
  );

  const uploadsDir = path.join(process.cwd(), "uploads");
  const announcementsDir = path.join(uploadsDir, "announcements");
  const profilesDir = path.join(uploadsDir, "profiles");

  if (!fs.existsSync(announcementsDir)) {
    fs.mkdirSync(announcementsDir, { recursive: true });
  }

  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }

  app.use("/uploads", express.static(uploadsDir));

  app.use("/api", routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
