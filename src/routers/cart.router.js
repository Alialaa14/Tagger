import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import {
  addToCart,
  cancelCoupon,
  changeQunantity,
  clearCart,
  getAllCarts,
  getCart,
  removeFromCart,
  updateCart,
} from "../controllers/cart.controller.js";

const router = Router();

router
  .route("/")
  .post(isAuthenticated, isAuthorized("user"), addToCart)
  .delete(isAuthenticated, isAuthorized("user"), clearCart)
  .put(isAuthenticated, isAuthorized("user"), removeFromCart)
  .patch(isAuthenticated, isAuthorized("user"), updateCart)
  .get(isAuthenticated, isAuthorized("admin", "user"), getCart);

router
  .route("/get-carts")
  .get(isAuthenticated, isAuthorized("admin"), getAllCarts);
router
  .route("/change-quantity")
  .put(isAuthenticated, isAuthorized("user"), changeQunantity);

router
  .route("/cancel-coupon")
  .delete(isAuthenticated, isAuthorized("user"), cancelCoupon);
export default router;
