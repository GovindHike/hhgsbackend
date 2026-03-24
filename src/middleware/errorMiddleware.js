import { StatusCodes } from "http-status-codes";

export const notFoundHandler = (req, _res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = StatusCodes.NOT_FOUND;
  next(error);
};

export const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

  res.status(statusCode).json({
    message: err.message || "Internal server error",
    details: err.details || null,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
};
