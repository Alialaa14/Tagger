import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Newsletter from "../models/newsletter.model.js";
import User from "../models/user.model.js";
import { StatusCodes } from "http-status-codes";
import { getPagination, getPaginationInfo } from "../utils/pagination.js";

// @Desc Subscribe to Newsletter
export const subscribe = asyncHandler(async (req, res, next) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "رقم الهاتف مطلوب"));
  }

  // Validate Egyptian phone number format (11 digits, starting with 010, 011, 012, 015)
  const phoneRegex = /^01[0125][0-9]{8}$/;
  if (!phoneRegex.test(phoneNumber)) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "رقم هاتف غير صالح. يجب أن يكون رقماً مصرياً مكوناً من 11 رقماً"));
  }

  // Check if user is registered with this phone number
  const user = await User.findOne({ phoneNumber });
  if (!user) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "هذا الرقم غير مسجل لدينا. يجب أن يكون لديك حساب للاشتراك"));
  }

  // Check if already subscribed
  const existingSub = await Newsletter.findOne({ user: user._id });
  if (existingSub) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "أنت مشترك بالفعل في القائمة البريدية"));
  }

  const subscription = await Newsletter.create({ user: user._id });

  return res.status(StatusCodes.CREATED).json(
    new ApiResponse(StatusCodes.CREATED, subscription, "تم الاشتراك في القائمة البريدية بنجاح")
  );
});

// @Desc Get all subscriptions (Admin)
export const getAllSubscriptions = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, search = "" } = req.query;

  const { skip, limit: enforcedLimit, page: currentPage } = getPagination(page, limit);

  // If there's a search term, we need to find matching users first
  let userMatchCriteria = {};
  if (search) {
    userMatchCriteria = {
      $or: [
        { username: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ],
    };
  }

  // If searching, find relevant user ids
  let query = {};
  if (Object.keys(userMatchCriteria).length > 0) {
    const matchedUsers = await User.find(userMatchCriteria).select("_id");
    const matchedUserIds = matchedUsers.map((u) => u._id);
    query.user = { $in: matchedUserIds };
  }

  const total = await Newsletter.countDocuments(query);
  const subscriptions = await Newsletter.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(enforcedLimit)
    .populate("user", "username phoneNumber shopName role");

  const paginationInfo = getPaginationInfo(total, currentPage, enforcedLimit);

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      { subscriptions, pagination: paginationInfo, total },
      "تم جلب المشتركين بنجاح"
    )
  );
});
