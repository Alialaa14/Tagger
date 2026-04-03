import { Router } from "express";
import { getHome } from "../controllers/pages.controller.js";

const router = Router();

router.route("/home").get(getHome);

export default router;
