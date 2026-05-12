import { body } from "express-validator";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

export const updateSettingsValidators = [
  body("autoForward")
    .optional()
    .isBoolean()
    .withMessage("autoForward must be a boolean"),
  body("orderTimeoutMinutes")
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage("orderTimeoutMinutes must be an integer between 1 and 1440"),
  body("requirePaymentProof")
    .optional()
    .isBoolean()
    .withMessage("requirePaymentProof must be a boolean"),
  body("priceCeilingEnabled")
    .optional()
    .isBoolean()
    .withMessage("priceCeilingEnabled must be a boolean"),
  body("defaultLowStockThreshold")
    .optional()
    .isInt({ min: 0 })
    .withMessage("defaultLowStockThreshold must be a non-negative integer"),
  body("platformCommissionRate")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("platformCommissionRate must be a number between 0 and 100"),
  validationMiddleware,
];
