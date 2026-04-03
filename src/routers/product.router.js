import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import upload from "../utils/multer.js";
import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getProduct,
  updateProduct,
} from "../controllers/product.controller.js";
import {
  createProductValidator,
  updateProductValidator,
  deleteProductValidator,
  getProductValidator,
  getProductsValidator,
} from "../validators/product.validator.js";

const router = Router();

// ─────────────────────────────────────────────────────────────
// CATALOG  —  authenticated browse for traders and users
//
// Traders  → pick a product → POST /api/trader-products/my
// Users    → pick a product → POST /api/inventory/platform
//
// GET /api/products/catalog?search=&page=1&limit=10&category=&minPrice=&maxPrice=
//
// Must be defined BEFORE /:id so "catalog" is not treated as a Mongo id
// ─────────────────────────────────────────────────────────────
router.get(
  "/catalog",
  isAuthenticated,
  isAuthorized("trader", "user", "admin"),
  getProductsValidator,
  getAllProducts,
);

// ─────────────────────────────────────────────────────────────
// PUBLIC LISTING
// GET  /api/products          — browse all products (no auth required)
// POST /api/products          — admin creates a product
// ─────────────────────────────────────────────────────────────
router
  .route("/")
  .get(getProductsValidator, getAllProducts)
  .post(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    createProductValidator,
    createProduct,
  );

// ─────────────────────────────────────────────────────────────
// SINGLE PRODUCT
// GET    /api/products/:id    — public
// PATCH  /api/products/:id   — admin only
// DELETE /api/products/:id   — admin only
// ─────────────────────────────────────────────────────────────
router
  .route("/:id")
  .get(getProductValidator, getProduct)
  .patch(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    updateProductValidator,
    updateProduct,
  )
  .delete(
    isAuthenticated,
    isAuthorized("admin"),
    deleteProductValidator,
    deleteProduct,
  );

export default router;
