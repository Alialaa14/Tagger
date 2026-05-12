import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import { ENV } from "../utils/ENV.js";
export const socketAuth = (socket, next) => {
  const cookies = socket.handshake?.headers?.cookie || "";
  // Check for both camelCase and snake_case for maximum compatibility
  const token = cookies.match(/accessToken=([^;]+)/)?.[1] || cookies.match(/access_token=([^;]+)/)?.[1];

  if (!token)
    return next(new ApiError(StatusCodes.UNAUTHORIZED, "Authentication Error"));
  try {
    const decoded = jwt.verify(token, ENV.ACCESS_TOKEN);
    socket.user = decoded.id;

    next();
  } catch (error) {
    return next(
      new ApiError(
        StatusCodes.UNAUTHORIZED,
        error.message || "Authentication Error",
      ),
    );
  }
};
