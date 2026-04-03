import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import { getOrders } from "../controllers/order.controller.js";
const router = Router();

router
  .route("/")
  .get(isAuthenticated, isAuthorized("admin", "user", "trader"), getOrders);

export default router;
