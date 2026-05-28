import { StatusCodes } from "http-status-codes";

export const notFoundHandler = (req, _res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = StatusCodes.NOT_FOUND;
  next(error);
};

export const errorHandler = (err, _req, res, _next) => {
  // err.status is used by multer (MulterError) and some other middleware
  const statusCode = err.statusCode || err.status || StatusCodes.INTERNAL_SERVER_ERROR;

  res.status(statusCode).json({
    message: err.message || "Internal server error",
    details: err.details || null,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
};
