import { check } from "express-validator";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

export const createProductValidator = [
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
  check("price")
    .notEmpty()
    .withMessage("Price is Required")
    .isNumeric()
    .withMessage("Price must be a number"),
  check("category")
    .notEmpty()
    .withMessage("Category is Required")
    .isMongoId()
    .withMessage("Invalid Category ID"),
  validationMiddleware,
];

export const updateProductValidator = [
  check("id")
    .notEmpty()
    .withMessage("Product id is Required")
    .isMongoId()
    .withMessage("Invalid ID"),
  check("name")
    .optional()
    .isLength({ min: 3, max: 20 })
    .withMessage("Name must be at least 3 and at most 20 characters long"),
  check("description")
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage(
      "Description must be at least 3 and at most 50 characters long",
    ),
  check("price").optional().isNumeric().withMessage("Price must be a number"),
  check("category").optional().isMongoId().withMessage("Invalid Category ID"),
  validationMiddleware,
];

export const deleteProductValidator = [
  check("id")
    .notEmpty()
    .withMessage("Product id is Required")
    .isMongoId()
    .withMessage("Invalid ID"),
  validationMiddleware,
];

export const getProductValidator = [
  check("id")
    .notEmpty()
    .withMessage("Product id is Required")
    .isMongoId()
    .withMessage("Invalid ID"),
  validationMiddleware,
];

export const getProductsValidator = [
  check("category").optional().isMongoId().withMessage("Invalid Category ID"),
  validationMiddleware,
];
