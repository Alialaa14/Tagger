import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import upload from "../utils/multer.js";
import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getProduct,
  updateProduct,
} from "../controllers/product.controller.js";
import {
  createProductValidator,
  updateProductValidator,
  deleteProductValidator,
  getProductValidator,
  getProductsValidator,
} from "../validators/product.validator.js";
const router = Router();
router
  .route("/")
  .get(
    isAuthenticated,
    isAuthorized("user", "admin"),
    getProductsValidator,
    getAllProducts,
  )
  .post(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    createProductValidator,
    createProduct,
  );

router
  .route("/:id")
  .get(
    isAuthenticated,
    isAuthorized("user", "admin"),
    getProductValidator,
    getProduct,
  )
  .patch(
    isAuthenticated,
    isAuthorized("admin"),
    upload.single("image"),
    updateProductValidator,
    updateProduct,
  )
  .delete(
    isAuthenticated,
    isAuthorized("admin"),
    deleteProductValidator,
    deleteProduct,
  );
export default router;
