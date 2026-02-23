import { validationResult } from "express-validator";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";

export const validationMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Validation Error", errors.array()),
    );
  }
  next();
};
