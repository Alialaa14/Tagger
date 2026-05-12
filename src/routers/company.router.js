import { Router } from "express";
import upload from "../utils/multer.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

import {
  getActiveCompanies,
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  toggleCompany,
  deleteCompany,
} from "../controllers/company.controller.js";
import {
  validateGetCompany,
  validateCreateCompany,
  validateUpdateCompany,
  validateToggleCompany,
  validateDeleteCompany,
} from "../validators/company.validators.js";

const router = Router();

// Public
router.route("/").get(getActiveCompanies);

// Admin only — apply isAuthenticated + isAuthorized to all routes below
router.use(isAuthenticated);

router.route("/all").get(getAllCompanies);

router
  .route("/")
  .post(
    isAuthorized("admin"),
    upload.single("logo"),
    validateCreateCompany,
    createCompany,
  );

router
  .route("/:id")
  .get(validateGetCompany, getCompanyById)
  .put(
    isAuthorized("admin"),
    upload.single("logo"),
    validateUpdateCompany,
    updateCompany,
  )
  .delete(isAuthorized("admin"), validateDeleteCompany, deleteCompany);

router
  .route("/:id/toggle")
  .patch(isAuthorized("admin"), validateToggleCompany, toggleCompany);

export default router;
