import { check } from "express-validator";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

export const createCategoryValidator = [
  check("name")
    .notEmpty()
    .withMessage("Name is Required")
    .isLength({ min: 3, max: 20 })
    .withMessage("Name must be at least 3 and at most 20 characters long"),
  check("description")
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage(
      "Description must be at least 3 and at most 50 characters long",
    ),
  validationMiddleware,
];

export const updateCategoryValidator = [
  check("id")
    .notEmpty()
    .withMessage("Category id is Required")
    .isMongoId()
    .withMessage("Invalid ID"),
  check("name")
    .notEmpty()
    .withMessage("Name is Required")
    .isLength({ min: 3, max: 20 }),
  check("description")
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage(
      "Description must be at least 3 and at most 50 characters long",
    ),
  validationMiddleware,
];

export const deleteCategoryValidator = [
  check("id")
    .notEmpty()
    .withMessage("Category id is Required")
    .isMongoId()
    .withMessage("Invalid ID"),
  validationMiddleware,
];

export const getCategoryValidator = [
  check("id")
    .notEmpty()
    .withMessage("Category id is Required")
    .isMongoId()
    .withMessage("Invalid ID"),
  validationMiddleware,
];
