import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import { getSettings, updateSettings } from "../controllers/settings.controller.js";
import { updateSettingsValidators } from "../validators/setting.validators.js";

const router = Router();

// All setting routes require admin authentication
router.use(isAuthenticated);

router.get("/", getSettings);
router.patch("/", isAuthorized("admin"), updateSettingsValidators, updateSettings);

export default router;
