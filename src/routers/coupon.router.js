import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import {
  createCoupon,
  deleteCoupon,
  getAllCoupons,
  getCoupon,
  updateCoupon,
} from "../controllers/coupon.controller.js";

const router = Router();
router.use(isAuthenticated, isAuthorized("admin"));

router.route("/").get(getAllCoupons).post(createCoupon);
router.route("/:id").get(getCoupon).patch(updateCoupon).delete(deleteCoupon);
export default router;
