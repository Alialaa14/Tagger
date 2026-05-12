import { check } from "express-validator";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";
// Middleware to check validation results and throw ApiError if any

// validationMiddleware get single banner
export const validateGetBanner = [
  check("id").isMongoId().withMessage("Invalid banner ID format"),

  validationMiddleware,
];

// validationMiddleware create banner
export const validateCreateBanner = [
  check("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 100 })
    .withMessage("Title must be at most 100 characters"),

  check("subtitle")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Subtitle must be at most 200 characters"),

  check("buttonText")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Button text must be at most 50 characters"),

  check("buttonLink")
    .optional()
    .trim()
    .isURL()
    .withMessage("Button link must be a valid URL"),

  check("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be true or false"),

  check("order")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Order must be a non-negative integer"),

  check("imageUrl")
    .optional()
    .trim()
    .isURL()
    .withMessage("Image URL must be a valid URL"),

  validationMiddleware,
];

// validationMiddleware update banner (id + all body fields optional)
export const validateUpdateBanner = [
  check("id").isMongoId().withMessage("Invalid banner ID format"),

  check("title")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Title cannot be empty")
    .isLength({ max: 100 })
    .withMessage("Title must be at most 100 characters"),

  check("subtitle")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Subtitle must be at most 200 characters"),

  check("buttonText")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Button text must be at most 50 characters"),

  check("buttonLink")
    .optional()
    .trim()
    .isURL()
    .withMessage("Button link must be a valid URL"),

  check("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be true or false"),

  check("order")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Order must be a non-negative integer"),

  check("imageUrl")
    .optional()
    .trim()
    .isURL()
    .withMessage("Image URL must be a valid URL"),

  validationMiddleware,
];

// validationMiddleware toggle banner (id only)
export const validateToggleBanner = [
  check("id").isMongoId().withMessage("Invalid banner ID format"),

  validationMiddleware,
];

// validationMiddleware delete banner (id only)
export const validateDeleteBanner = [
  check("id").isMongoId().withMessage("Invalid banner ID format"),

  validationMiddleware,
];
