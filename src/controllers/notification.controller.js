import { asyncHandler } from "../utils/asyncHandler.js";
import Notification from "../models/notification.model.js";
import { StatusCodes } from "http-status-codes";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import User from "../models/user.model.js";
import { onlineUsers } from "../../server.js";

// ─── socket handler ───────────────────────────────────────────────────────────

export const sendNotification = (io, socket) => {
  socket.on("sendNotification", async (notification) => {
    console.log("Received notification:", notification);
    if (notification.forAll) {
      const newNotification = await Notification.create({
        message: notification.message,
        forAll: true,
      });
      console.log("Created notification for all users:", newNotification);

      if (!newNotification) return;

      return io.emit("newNotification", newNotification);
    }
    const user = await User.findOne({ phoneNumber: notification.phoneNumber });
    if (!user) return;

    const newNotification = await Notification.create({
      user: user._id,
      message: notification.message,
      forAll: notification.forAll,
    });

    if (!newNotification) return;

    if (newNotification.forAll) {
      // io.emit broadcasts to ALL connected clients (io.broadcast skips the sender only)
      return io.emit("newNotification", newNotification);
    }

    const socketId = onlineUsers.get(user._id.toString());
    if (socketId) {
      return io.to(socketId).emit("newNotification", newNotification);
    }
  });
};

// ─── helper: attach a per-user `read` boolean to each notification ────────────

function withReadStatus(notifications, userId) {
  const id = userId.toString();
  return notifications.map((n) => {
    const obj = n.toObject();
    obj.read = obj.readBy?.some((r) => r.toString() === id) ?? false;
    return obj;
  });
}

// ─── GET /notifications ───────────────────────────────────────────────────────

export const getAllNotifications = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const user = await User.findById(req.user.id);
  if (!user) return next(new ApiError(StatusCodes.NOT_FOUND, "User Not Found"));

  const query =
    user.role === "admin"
      ? {}
      : { $or: [{ user: user._id }, { forAll: true }] };

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("user", "username shopName logo phoneNumber");

  // Return empty array instead of 404 — the frontend handles the empty state
  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        withReadStatus(notifications, user._id),
        "Notifications Fetched",
      ),
    );
});

// ─── GET /notifications/:id ───────────────────────────────────────────────────

export const getNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id).populate(
    "user",
    "username shopName logo phoneNumber",
  );

  if (!notification)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Notification Not Found"));

  // Mark as read without duplicating the user entry
  const alreadyRead = notification.readBy.some(
    (r) => r.toString() === req.user.id.toString(),
  );

  if (!alreadyRead) {
    notification.readBy.push(req.user.id);
    await notification.save();
  }

  const obj = notification.toObject();
  obj.read = true; // caller just opened it — always read by now

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, obj, "Notification Fetched"));
});

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────
// Lightweight "mark as read" without loading the full notification detail page

export const markNotificationRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { readBy: req.user.id } }, // $addToSet guarantees no duplicates
    { new: true },
  );
  console.log(notification);
  if (!notification)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Notification Not Found"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, { read: true }, "Marked as read"));
});

// ─── PATCH /notifications/read-all ───────────────────────────────────────────
// Marks every notification visible to this user as read in one query

export const markAllNotificationsRead = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) return next(new ApiError(StatusCodes.NOT_FOUND, "User Not Found"));

  const filter =
    user.role === "admin"
      ? {}
      : { $or: [{ user: user._id }, { forAll: true }] };

  await Notification.updateMany(
    { ...filter, readBy: { $ne: req.user.id } }, // only touch unread ones
    { $addToSet: { readBy: req.user.id } },
  );

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, null, "All notifications marked as read"),
    );
});

// ─── PUT /notifications/:id ───────────────────────────────────────────────────

export const updateNotification = asyncHandler(async (req, res, next) => {
  const { message } = req.body;

  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { message },
    { new: true },
  );

  if (!notification)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Notification Not Found"));

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, notification, "Notification Updated"),
    );
});

// ─── DELETE /notifications/:id ────────────────────────────────────────────────

export const deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findByIdAndDelete(req.params.id);

  if (!notification)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Notification Not Found"));

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, notification, "Notification Deleted"),
    );
});
