import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import {
  createOrder,
  getOrders,
  getOrder,
  updateOrder,
  deleteOrder,
  forwardOrder,
  getOrderStats,
  getUserOrderStats,
} from "../controllers/order.controller.js";
import {
  createOrderValidators,
  updateOrderValidators,
  orderIdValidators,
  orderQueryValidators,
  forwardOrderValidators,
  orderStatsValidators,
  userStatsValidators,
} from "../validators/order.validators.js";

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

// Get orders with filtering and pagination
router
  .route("/")
  .get(orderQueryValidators, getOrders)
  .post(createOrderValidators, createOrder);

// Get, update, delete specific order
router
  .route("/:id")
  .get(orderIdValidators, getOrder)
  .patch(
    isAuthorized("admin", "user"),
    updateOrderValidators,
    updateOrder
  )
  .delete(
    isAuthorized("admin", "user"),
    orderIdValidators,
    deleteOrder
  );

// Forward order to trader (admin only)
router
  .route("/forward")
  .post(
    isAuthorized("admin"),
    forwardOrderValidators,
    forwardOrder
  );

// Get order statistics (admin only)
router
  .route("/stats")
  .get(
    isAuthorized("admin"),
    orderStatsValidators,
    getOrderStats
  );

// Get user-specific order statistics
router
  .route("/stats/:userId")
  .get(
    userStatsValidators,
    getUserOrderStats
  );

export default router;
