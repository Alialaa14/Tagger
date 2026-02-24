import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import upload from "../utils/multer.js";
import {
  createAdminUser,
  forgetPassword,
  getAllUsers,
  getUser,
  login,
  logout,
  register,
  resetPassword,
  updateProfile,
  verifyOtp,
} from "../controllers/user.controller.js";

import {
  adminUserValidator,
  forgetPasswordValidator,
  getUserValidator,
  loginValidator,
  registerValidator,
  resetPasswordValidator,
  updateProfileValidator,
  verifyOtpValidator,
} from "../validators/user.validators.js";

const router = Router();
router
  .route("/register")
  .post(upload.single("logo"), registerValidator, register);
router.route("/login").post(loginValidator, login);
router.route("/logout").post(isAuthenticated, logout);
router.route("/forget-password").post(forgetPasswordValidator, forgetPassword);
router.route("/verify-otp").post(verifyOtpValidator, verifyOtp);
router.route("/reset-password").post(resetPasswordValidator, resetPassword);
router
  .route("/update-profile")
  .patch(
    isAuthenticated,
    isAuthorized("user", "trader", "admin"),
    upload.single("logo"),
    updateProfileValidator,
    updateProfile,
  );

router
  .route("/get-user/:id")
  .get(isAuthenticated, isAuthorized("admin"), getUserValidator, getUser);
router
  .route("/get-users")
  .get(isAuthenticated, isAuthorized("admin"), getAllUsers);
router
  .route("/admin")
  .post(
    isAuthenticated,
    isAuthorized("admin"),
    adminUserValidator,
    createAdminUser,
  );
export default router;
