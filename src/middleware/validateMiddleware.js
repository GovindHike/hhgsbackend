import { StatusCodes } from "http-status-codes";
import { AppError } from "../utils/AppError.js";

export const validate = (schema, target = "body") => (req, _res, next) => {
  const { error, value } = schema.validate(req[target], {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return next(
      new AppError("Validation failed", StatusCodes.BAD_REQUEST, error.details.map((item) => item.message))
    );
  }

  req[target] = value;
  next();
};
