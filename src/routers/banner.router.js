import { Router } from "express";
import upload from "../utils/multer.js";
import {
  getActiveBanners,
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  toggleBanner,
  deleteBanner,
} from "../controllers/banner.controller.js";
import {
  validateGetBanner,
  validateCreateBanner,
  validateUpdateBanner,
  validateToggleBanner,
  validateDeleteBanner,
} from "../validators/banner.validators.js";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const router = Router();

router
  .route("/")
  .get(getActiveBanners)
  .post(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    validateCreateBanner,
    createBanner,
  );

router.route("/all").get(isAuthenticated, isAuthorized("admin"), getAllBanners);

router
  .route("/:id")
  .get(isAuthenticated, isAuthorized("admin"), validateGetBanner, getBannerById)
  .put(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    validateUpdateBanner,
    updateBanner,
  )
  .delete(
    isAuthenticated,
    isAuthorized("admin"),
    validateDeleteBanner,
    deleteBanner,
  );

router
  .route("/:id/toggle")
  .patch(
    isAuthenticated,
    isAuthorized("admin"),
    validateToggleBanner,
    toggleBanner,
  );

export default router;
