import User from "../models/user.model.js";
import ApiError from "../utils/ApiError.js";

export const isAuthorized = (...role) => {
  return async (req, res, next) => {
    const user = await User.findById(req.user.id);
    if (!role.includes(user.role)) {
      return next(new ApiError(403, "You are not authorized"));
    }
    next();
  };
};
