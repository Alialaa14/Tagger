import { check, param, query } from "express-validator";
import mongoose from "mongoose";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

// Order creation validation
export const createOrderValidators = [
  check("shopId")
    .notEmpty()
    .withMessage("Shop ID is required")
    .isMongoId()
    .withMessage("Invalid shop ID")
    .custom(async (value) => {
      const User = (await import("../models/user.model.js")).default;
      const user = await User.findById(value);
      if (!user) {
        throw new Error("Shop not found");
      }
      if (user.role !== "user") {
        throw new Error("Shop must be a user account");
      }
      return true;
    }),

  check("products")
    .isArray({ min: 1 })
    .withMessage("Products array is required and must contain at least one product"),

  check("products.*.productId")
    .isMongoId()
    .withMessage("Invalid product ID")
    .custom(async (value) => {
      const Product = (await import("../models/product.model.js")).default;
      const product = await Product.findById(value);
      if (!product) {
        throw new Error("Product not found");
      }
      return true;
    }),

  check("products.*.quantity")
    .isInt({ min: 1 })
    .withMessage("Quantity must be a positive integer"),

  check("products.*.totalPrice")
    .isFloat({ min: 0 })
    .withMessage("Total price must be a non-negative number"),

  check("totalPrice")
    .isFloat({ min: 0 })
    .withMessage("Total price must be a non-negative number"),

  check("totalQuantity")
    .isInt({ min: 1 })
    .withMessage("Total quantity must be a positive integer"),

  check("address")
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage("Address must be between 3 and 50 characters")
    .trim(),

  check("note")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Note cannot exceed 500 characters")
    .trim(),

  check("paymentMethod")
    .optional()
    .isIn(["Cash", "Card", "Online"])
    .withMessage("Invalid payment method"),

  check("coupon")
    .optional()
    .custom(async (value) => {
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error("Invalid coupon ID");
      }
      if (value) {
        const Coupon = (await import("../models/coupon.model.js")).default;
        const coupon = await Coupon.findById(value);
        if (!coupon) {
          throw new Error("Coupon not found");
        }
        const now = new Date();
        if (coupon.expiryDate && coupon.expiryDate < now) {
          throw new Error("Coupon has expired");
        }
      }
      return true;
    }),

  validationMiddleware,
];

// Order update validation
export const updateOrderValidators = [
  check("status")
    .optional()
    .isIn(["pending", "accepted", "rejected", "shipped", "delivered", "cancelled"])
    .withMessage("Invalid order status"),

  check("traderId")
    .optional()
    .isMongoId()
    .withMessage("Invalid trader ID")
    .custom(async (value) => {
      if (value) {
        const User = (await import("../models/user.model.js")).default;
        const user = await User.findById(value);
        if (!user) {
          throw new Error("Trader not found");
        }
        if (user.role !== "trader") {
          throw new Error("Trader must be a trader account");
        }
      }
      return true;
    }),

  check("products")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Products array must contain at least one product"),

  check("products.*.productId")
    .optional()
    .isMongoId()
    .withMessage("Invalid product ID"),

  check("products.*.quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Quantity must be a positive integer"),

  check("products.*.totalPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Total price must be a non-negative number"),

  check("totalPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Total price must be a non-negative number"),

  check("totalQuantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Total quantity must be a positive integer"),

  check("address")
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage("Address must be between 3 and 50 characters")
    .trim(),

  check("note")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Note cannot exceed 500 characters")
    .trim(),

  check("paymentMethod")
    .optional()
    .isIn(["Cash", "Card", "Online"])
    .withMessage("Invalid payment method"),

  validationMiddleware,
];

// Order ID validation
export const orderIdValidators = [
  param("id")
    .isMongoId()
    .withMessage("Invalid order ID")
    .custom(async (value) => {
      const Order = (await import("../models/order.model.js")).default;
      const order = await Order.findById(value);
      if (!order) {
        throw new Error("Order not found");
      }
      return true;
    }),

  validationMiddleware,
];

// Order query validation
export const orderQueryValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  query("sortBy")
    .optional()
    .isIn(["createdAt", "updatedAt", "totalPrice", "totalQuantity", "status"])
    .withMessage("Invalid sort field"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("Sort order must be 'asc' or 'desc'"),

  query("status")
    .optional()
    .isIn(["pending", "accepted", "rejected", "shipped", "delivered", "cancelled"])
    .withMessage("Invalid status filter"),

  query("userId")
    .optional()
    .isMongoId()
    .withMessage("Invalid user ID"),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid start date format"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid end date format"),

  validationMiddleware,
];

// Forward order validation
export const forwardOrderValidators = [
  check("orderId")
    .notEmpty()
    .withMessage("Order ID is required")
    .isMongoId()
    .withMessage("Invalid order ID")
    .custom(async (value) => {
      const Order = (await import("../models/order.model.js")).default;
      const order = await Order.findById(value);
      if (!order) {
        throw new Error("Order not found");
      }
      return true;
    }),

  check("traderId")
    .notEmpty()
    .withMessage("Trader ID is required")
    .isMongoId()
    .withMessage("Invalid trader ID")
    .custom(async (value) => {
      const User = (await import("../models/user.model.js")).default;
      const user = await User.findById(value);
      if (!user) {
        throw new Error("Trader not found");
      }
      if (user.role !== "trader") {
        throw new Error("Trader must be a trader account");
      }
      return true;
    }),

  validationMiddleware,
];

// Order statistics query validation
export const orderStatsValidators = [
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid start date format"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid end date format"),

  validationMiddleware,
];

// User ID validation for statistics
export const userStatsValidators = [
  param("userId")
    .isMongoId()
    .withMessage("Invalid user ID")
    .custom(async (value) => {
      const User = (await import("../models/user.model.js")).default;
      const user = await User.findById(value);
      if (!user) {
        throw new Error("User not found");
      }
      return true;
    }),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid start date format"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid end date format"),

  validationMiddleware,
];