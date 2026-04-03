import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import {
  getAllNotifications,
  getNotification,
  updateNotification,
  deleteNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notification.controller.js";

const router = Router();

router
  .route("/")
  .get(isAuthenticated, getAllNotifications);

// Must be defined before /:id so "read-all" is not captured as an id param
router
  .route("/read-all")
  .patch(isAuthenticated, markAllNotificationsRead);

router
  .route("/:id")
  .get(isAuthenticated, getNotification)
  .patch(isAuthenticated, isAuthorized("admin"), updateNotification)
  .delete(isAuthenticated, isAuthorized("admin"), deleteNotification);

router
  .route("/:id/read")
  .patch(isAuthenticated, markNotificationRead);

export default router;
