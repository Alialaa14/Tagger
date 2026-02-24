import jwt from "jsonwebtoken";
import { ENV } from "../utils/ENV.js";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";

export const isAuthenticated = (req, res, next) => {
  const token =
    req.cookies?.accessToken || req.headers?.authorization?.split(" ")[1];
  if (!token)
    return next(
      new ApiError(StatusCodes.UNAUTHORIZED, "You are not authenticated"),
    );

  try {
    const decoded = jwt.verify(token, ENV.ACCESS_TOKEN);

    req.user = decoded;
    return next();
  } catch (error) {
    return next(
      new ApiError(
        StatusCodes.UNAUTHORIZED,
        "Invalid token, authentication failed",
      ),
    );
  }
};
