import { validationResult } from "express-validator";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";

export const validationMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    throw new ApiError(StatusCodes.BAD_REQUEST, messages.join(", "));
  }
  next();
};
