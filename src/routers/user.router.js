import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import { authLimiter } from "../middlewares/security.js";
import upload from "../utils/multer.js";
import {
  createAdminUser,
  deleteUser,
  forgetPassword,
  getAllUsers,
  getAuthenticatedUser,
  getUser,
  getUsersOnline,
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
  .post(authLimiter, upload.single("logo"), registerValidator, register);
router.route("/login").post(authLimiter, loginValidator, login);
router.route("/logout").post(isAuthenticated, logout);
router.route("/forget-password").post(authLimiter, forgetPasswordValidator, forgetPassword);
router.route("/verify-otp").post(authLimiter, verifyOtpValidator, verifyOtp);
router.route("/reset-password").post(authLimiter, resetPasswordValidator, resetPassword);
router
  .route("/update-profile")
  .patch(
    isAuthenticated,
    upload.single("logo"),
    updateProfileValidator,
    updateProfile,
  );

router
  .route("/user/:id")
  .get(isAuthenticated, isAuthorized("admin"), getUserValidator, getUser)
  .delete(isAuthenticated, isAuthorized("admin"), getUserValidator, deleteUser);
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
router
  .route("/users-online")
  .get(isAuthenticated, isAuthorized("admin"), getUsersOnline);

router.route("/me").get(isAuthenticated, getAuthenticatedUser);
export default router;
