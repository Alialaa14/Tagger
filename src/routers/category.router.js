import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import upload from "../utils/multer.js";
import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
} from "../controllers/category.controller.js";
import {
  createCategoryValidator,
  updateCategoryValidator,
  deleteCategoryValidator,
  getCategoryValidator,
} from "../validators/category.validators.js";
const router = Router();

router
  .route("/")
  .get(getAllCategories)
  .post(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    createCategoryValidator,
    createCategory,
  );

router
  .route("/:id")
  .get(getCategoryValidator, getCategoryById)
  .patch(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    updateCategoryValidator,
    updateCategory,
  )
  .delete(
    isAuthenticated,
    isAuthorized("admin"),
    deleteCategoryValidator,
    deleteCategory,
  );
export default router;
