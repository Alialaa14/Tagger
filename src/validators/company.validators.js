import { check } from "express-validator";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

export const validateGetCompany = [
  check("id").isMongoId().withMessage("Invalid company ID format"),
  validationMiddleware,
];

export const validateCreateCompany = [
  check("name")
    .trim()
    .notEmpty()
    .withMessage("Company name is required")
    .isLength({ min: 3 })
    .withMessage("Company name must be at least 3 characters long")
    .isLength({ max: 50 })
    .withMessage("Company name must be at most 50 characters long"),

  check("description")
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage("Description must be at least 3 characters long")
    .isLength({ max: 500 })
    .withMessage("Description must be at most 500 characters long"),

  validationMiddleware,
];

export const validateUpdateCompany = [
  check("id").isMongoId().withMessage("Invalid company ID format"),

  check("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Company name cannot be empty")
    .isLength({ min: 3 })
    .withMessage("Company name must be at least 3 characters long")
    .isLength({ max: 50 })
    .withMessage("Company name must be at most 50 characters long"),

  check("description")
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage("Description must be at least 3 characters long")
    .isLength({ max: 500 })
    .withMessage("Description must be at most 500 characters long"),

  validationMiddleware,
];

export const validateToggleCompany = [
  check("id").isMongoId().withMessage("Invalid company ID format"),
  validationMiddleware,
];

export const validateDeleteCompany = [
  check("id").isMongoId().withMessage("Invalid company ID format"),
  validationMiddleware,
];
