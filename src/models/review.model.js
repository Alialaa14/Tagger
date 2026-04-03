import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    starsCount: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true },
);

// Index for fast "get all reviews for a trader" queries
reviewSchema.index({ user: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);
export default Review;
