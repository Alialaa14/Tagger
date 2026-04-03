import { asyncHandler } from "../utils/asyncHandler.js";
import Review from "../models/review.model.js";
import { StatusCodes } from "http-status-codes";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import User from "../models/user.model.js";
// ─── POST /reviews ────────────────────────────────────────────────────────────
// Any authenticated user or trader can create multiple platform reviews

export const createReview = asyncHandler(async (req, res, next) => {
  const { starsCount, content } = req.body;

  const review = await Review.create({
    user: req.user.id,
    starsCount,
    content,
  });

  return res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse(StatusCodes.CREATED, review, "Review created"));
});

// ─── GET /reviews/my ─────────────────────────────────────────────────────────
// Returns all reviews belonging to the current user (paginated)

export const getMyReviews = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [reviews, total] = await Promise.all([
    Review.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("user", "username logo phoneNumber role"),
    Review.countDocuments({ user: req.user.id }),
  ]);

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        reviews,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
      "Your reviews fetched",
    ),
  );
});

// ─── GET /reviews ─────────────────────────────────────────────────────────────
// Admin only — returns all platform reviews with pagination + avg stars

export const getAllReviews = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (user.role !== "admin")
    return next(
      new ApiError(StatusCodes.FORBIDDEN, "Access denied. Admins only."),
    );

  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [reviews, total] = await Promise.all([
    Review.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("user", "username logo phoneNumber role"),
    Review.countDocuments(),
  ]);

  const aggregate = await Review.aggregate([
    { $group: { _id: null, avgStars: { $avg: "$starsCount" } } },
  ]);
  const avgStars = aggregate[0]?.avgStars
    ? parseFloat(aggregate[0].avgStars.toFixed(1))
    : null;

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        reviews,
        avgStars,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
      "All reviews fetched",
    ),
  );
});

// ─── GET /reviews/:id ─────────────────────────────────────────────────────────
// Get a single review by its ID (owner or admin only)

export const getReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id).populate(
    "user",
    "username logo phoneNumber role",
  );

  if (!review)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Review not found"));

  const isOwner = review.user._id.toString() === req.user.id.toString();
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin)
    return next(new ApiError(StatusCodes.FORBIDDEN, "Access denied"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, review, "Review fetched"));
});

// ─── PATCH /reviews/:id ───────────────────────────────────────────────────────
// Owner updates their review by ID

export const updateReview = asyncHandler(async (req, res, next) => {
  const { starsCount, content } = req.body;

  const review = await Review.findById(req.params.id);
  if (!review)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Review not found"));

  if (review.user.toString() !== req.user.id.toString())
    return next(
      new ApiError(
        StatusCodes.FORBIDDEN,
        "Not authorized to update this review",
      ),
    );

  if (starsCount !== undefined) review.starsCount = starsCount;
  if (content !== undefined) review.content = content;

  await review.save();

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, review, "Review updated"));
});

// ─── DELETE /reviews/:id ──────────────────────────────────────────────────────
// Owner deletes their review by ID

export const deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Review not found"));

  if (review.user.toString() !== req.user.id.toString())
    return next(
      new ApiError(
        StatusCodes.FORBIDDEN,
        "Not authorized to delete this review",
      ),
    );

  await review.deleteOne();

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, "Review deleted"));
});
