import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import {
  createTraderProduct,
  getMyTraderProducts,
  getTraderProductById,
  getProductsByTrader,
  updateTraderProduct,
  deleteTraderProduct,
  getLinkedTraderProduct,
} from "../controllers/traderProduct.controller.js";

const router = Router();

// ─────────────────────────────────────────────────────────────
// All routes require a valid JWT
// ─────────────────────────────────────────────────────────────
router.use(isAuthenticated);

// ─────────────────────────────────────────────────────────────
// NOTE: Product catalog browsing has been consolidated into the
// product router to avoid duplication.
//
// To browse products before creating a listing, use:
//   GET /api/products/catalog?search=&page=1&limit=10
// (requires authentication + trader | user | admin role)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// LINK LOOKUP  —  resolve a listing by productId + traderId
// GET /api/trader-products/link?productId=&traderId=
// Defined before /:id so "link" is not treated as a Mongo id
// ─────────────────────────────────────────────────────────────
router.get("/link", isAuthorized("trader", "admin"), getLinkedTraderProduct);

// ─────────────────────────────────────────────────────────────
// MY LISTINGS  —  trader's own listed products
// GET  /api/trader-products/my
// POST /api/trader-products/my
// ─────────────────────────────────────────────────────────────
router
  .route("/my")
  .get(isAuthorized("trader"), getMyTraderProducts)
  .post(isAuthorized("trader"), createTraderProduct);

// ─────────────────────────────────────────────────────────────
// BY TRADER  —  all listings for a specific traderId
// GET /api/trader-products/trader/:traderId
// ─────────────────────────────────────────────────────────────
router.get(
  "/trader/:traderId",
  isAuthorized("trader", "admin"),
  getProductsByTrader,
);

// ─────────────────────────────────────────────────────────────
// SINGLE LISTING  —  get · update · delete by traderProduct _id
// GET    /api/trader-products/:id
// PATCH  /api/trader-products/:id
// DELETE /api/trader-products/:id
// ─────────────────────────────────────────────────────────────
router
  .route("/:id")
  .get(isAuthorized("trader", "admin"), getTraderProductById)
  .patch(isAuthorized("trader"), updateTraderProduct)
  .delete(isAuthorized("trader", "admin"), deleteTraderProduct);

export default router;
