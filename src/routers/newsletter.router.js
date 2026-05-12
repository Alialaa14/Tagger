import { Router } from "express";
import { subscribe, getAllSubscriptions } from "../controllers/newsletter.controller.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
const router = Router();

router.post("/subscribe", isAuthenticated, isAuthorized("user", "trader"), subscribe);
router.get("/", isAuthenticated, isAuthorized("admin"), getAllSubscriptions);

export default router;
