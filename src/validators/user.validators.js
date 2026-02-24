import { check } from "express-validator";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

export const registerValidator = [
  check("username")
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 4, max: 20 })
    .withMessage("Username must be at least 4 and at most 20 characters long"),
  check("shopName")
    .notEmpty()
    .withMessage("shopName is required")
    .isLength({ min: 4, max: 20 })
    .withMessage("shopName must be at least 4 and at most 20 characters long"),
  check("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isMobilePhone("ar-EG")
    .withMessage("Invalid phone number"),
  check("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({
      min: 8,
      max: 20,
    })
    .withMessage("must be at least 8 and at most 20 characters long "),
  check("city").notEmpty().withMessage("City is required"),
  check("governorate").notEmpty().withMessage("Governorate is required"),
  check("address").notEmpty().withMessage("Address is required"),
  validationMiddleware,
];

export const loginValidator = [
  check("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isMobilePhone("ar-EG")
    .withMessage("Invalid phone number"),
  check("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({
      min: 8,
      max: 20,
    })
    .withMessage("must be at least 8 and at most 20 characters long "),
  validationMiddleware,
];

export const updateProfileValidator = [
  check("username")
    .optional()
    .isLength({ min: 4, max: 20 })
    .withMessage("Username must be at least 4 and at most 20 characters long"),
  check("shopName")
    .optional()
    .isLength({ min: 4, max: 20 })
    .withMessage("shopName must be at least 4 and at most 20 characters long"),
  check("phoneNumber")
    .optional()
    .isMobilePhone("ar-EG")
    .withMessage("Invalid phone number"),
  check("city").optional(),
  check("governorate").optional(),
  check("address").optional(),
  validationMiddleware,
];

export const forgetPasswordValidator = [
  check("phoneNumber").notEmpty().withMessage("Phone number is required"),
  check("email")
    .notEmpty()
    .withMessage("Email is Required")
    .isEmail()
    .withMessage("Invalid Email"),
  validationMiddleware,
];

export const verifyOtpValidator = [
  check("otp").notEmpty().withMessage("Otp is Required"),
  validationMiddleware,
];

export const resetPasswordValidator = [
  check("password").notEmpty().withMessage("Password is Required"),
  validationMiddleware,
];

export const getUserValidator = [
  check("id")
    .notEmpty()
    .withMessage("ID Of User is Required")
    .isMongoId()
    .withMessage("Invalid ID"),
  validationMiddleware,
];

export const adminUserValidator = [
  check("username").notEmpty().withMessage("Username is Required"),
  check("password").notEmpty().withMessage("Password is Required"),
  check("phoneNumber").notEmpty().withMessage("Phone Number is Required"),
  validationMiddleware,
];
