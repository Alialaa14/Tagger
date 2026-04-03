import { Router } from "express";
import {
  createReview,
  getMyReviews,
  getAllReviews,
  getReview,
  updateReview,
  deleteReview,
} from "../controllers/review.controller.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

router.post("/", isAuthorized("user", "trader"), createReview); // Create a new review
router.get("/my", isAuthorized("user", "trader"), getMyReviews); // Get current user's own reviews (paginated)
router.get("/", isAuthorized("admin"), getAllReviews); // Admin: get all reviews (paginated + avgStars)
router.get("/:id", getReview); // Get a single review by ID (owner or admin)
router.patch("/:id", updateReview); // Update a review by ID (owner only)
router.delete("/:id", deleteReview); // Delete a review by ID (owner only)

export default router;
