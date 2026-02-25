import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Coupon from "../models/coupon.model.js";
import { StatusCodes } from "http-status-codes";

export const getCoupon = asyncHandler(async (req, res, next) => {
  const couponId = req.params.id;

  const coupon = await Coupon.findById(couponId).populate(
    "usedBy",
    "name shopName phoneNumber",
  );
  if (!coupon)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Coupon Not Found"));

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, coupon, "Coupon Fetched Successfully"),
    );
});

export const getAllCoupons = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, search, used, expired } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let query = {};
  if (search) {
    query.name = { $regex: search, $options: "i" };
  }
  if (used) {
    query.isUsed = used;
  }
  if (expired) {
    query.expiry =
      expired === "true" ? { $lt: Date.now() } : { $gt: Date.now() };
  }
  const coupons = await Coupon.find(query)
    .skip(skip)
    .limit(Number(limit))
    .sort({ createdAt: -1 });
  if (!coupons || coupons.length === 0) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "There are no Coupons"));
  }
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, coupons, "Coupons Fetched"));
});

export const createCoupon = asyncHandler(async (req, res, next) => {
  const { name, discount, expiry } = req.body;

  const couponExists = await Coupon.findOne({ name });
  if (couponExists)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Coupon Already Exists"));

  const newCoupon = await Coupon.create({ name, discount, expiry });
  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, newCoupon, "Coupon Created Successfully"),
    );
});

export const updateCoupon = asyncHandler(async (req, res, next) => {
  const couponId = req.params.id;
  const { name, discount, expiry } = req.body;

  const couponExists = await Coupon.findById(couponId);
  if (!couponExists)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Coupon Not Found"));

  const nameExists = await Coupon.findOne({ name });
  if (nameExists)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Coupon Already Exists"));

  const updatedCoupon = await Coupon.findByIdAndUpdate(
    couponId,
    { name, discount, expiry },
    { new: true },
  );
  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        updatedCoupon,
        "Coupon Updated Successfully",
      ),
    );
});

export const deleteCoupon = asyncHandler(async (req, res, next) => {
  const couponId = req.params.id;

  const couponExists = await Coupon.findById(couponId);
  if (!couponExists)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Coupon Not Found"));

  const deletedCoupon = await Coupon.findByIdAndDelete(couponId);
  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        deletedCoupon,
        "Coupon Deleted Successfully",
      ),
    );
});
