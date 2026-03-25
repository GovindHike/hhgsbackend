import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import "express-async-errors";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import { env } from "./config/env.js";

export const createApp = () => {
  const app = express();
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
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
