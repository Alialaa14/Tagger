import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import upload from "../utils/multer.js";
import {
  createPlatformInventory,
  createCustomInventory,
  getMyInventory,
  getInventoryById,
  getInventoryByUser,
  updateInventory,
  deleteInventory,
  stockIn,
  stockOut,
  adjustStock,
  getInventoryLogs,
} from "../controllers/inventory.controller.js";

const router = Router();

// ─────────────────────────────────────────────────────────────
// All routes require a valid JWT
// ─────────────────────────────────────────────────────────────
router.use(isAuthenticated);

// ─────────────────────────────────────────────────────────────
// NOTE: Product catalog browsing has been consolidated into the
// product router to avoid duplication.
//
// To browse platform products before adding to inventory, use:
//   GET /api/products/catalog?search=&page=1&limit=10
// (requires authentication + trader | user | admin role)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// CREATE
// POST /api/inventory/platform  — link a catalog product (no image)
// POST /api/inventory/custom    — create a custom product (image required)
// ─────────────────────────────────────────────────────────────
router.post("/platform", isAuthorized("user"), createPlatformInventory);
router.post(
  "/custom",
  isAuthorized("user"),
  upload.single("image"),
  createCustomInventory,
);

// ─────────────────────────────────────────────────────────────
// READ — logged-in user's own inventory
// GET /api/inventory/my?source=platform|custom&lowStock=true
// ─────────────────────────────────────────────────────────────
router.get("/my", isAuthorized("user"), getMyInventory);

// ─────────────────────────────────────────────────────────────
// READ — admin view of a specific user's full inventory
// GET /api/inventory/user/:userId
// ─────────────────────────────────────────────────────────────
router.get("/user/:userId", isAuthorized("admin"), getInventoryByUser);

// ─────────────────────────────────────────────────────────────
// STOCK MOVEMENTS
// Defined before /:id to avoid route collision
// POST /api/inventory/:id/stock-in
// POST /api/inventory/:id/stock-out
// POST /api/inventory/:id/adjust
// ─────────────────────────────────────────────────────────────
router.post("/:id/stock-in", isAuthorized("user"), stockIn);
router.post("/:id/stock-out", isAuthorized("user"), stockOut);
router.post("/:id/adjust", isAuthorized("user", "admin"), adjustStock);

// ─────────────────────────────────────────────────────────────
// LOGS
// GET /api/inventory/:id/logs?type=stock_in|stock_out|adjustment
// ─────────────────────────────────────────────────────────────
router.get("/:id/logs", isAuthorized("user", "admin"), getInventoryLogs);

// ─────────────────────────────────────────────────────────────
// SINGLE RECORD — get · update · delete
// GET    /api/inventory/:id
// PATCH  /api/inventory/:id  — image upload optional for custom products
// DELETE /api/inventory/:id
// ─────────────────────────────────────────────────────────────
router
  .route("/:id")
  .get(isAuthorized("user", "admin"), getInventoryById)
  .patch(isAuthorized("user"), upload.single("image"), updateInventory)
  .delete(isAuthorized("user", "admin"), deleteInventory);

export default router;
