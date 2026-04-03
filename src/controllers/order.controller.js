import Order from "../models/order.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";
import { onlineUsers } from "../../server.js";
import User from "../models/user.model.js";
import { calculateOrderRank } from "../utils/orderUtils.js";
import { enqueueOrderCheck, cancelOrderCheck } from "../utils/orderQueue.js";
import { autoChooseTrader } from "../utils/orderUtils.js";
import { autoStockInOnDelivery } from "./inventory.controller.js";

// ─── sendOrder ───────────────────────────────────────────────────────────────
export const sendOrder = (io, socket) => {
  socket.on("sendOrder", async (orderPayload) => {
    const newOrder = await Order.create(orderPayload.order);
    console.log(newOrder);
    if (!newOrder) {
      return socket.emit("error", "Order Not Created");
    }

    const order = await Order.findById(newOrder._id).populate(
      "shopId",
      "shopName phoneNumber address city governorate",
    );

    io.to("admin").emit("newOrder", { order });

    // ── Schedule a timeout check if a trader was already assigned ──
    if (newOrder.traderId) {
      await enqueueOrderCheck(
        newOrder._id.toString(),
        newOrder.traderId.toString(),
        [],
      );
    }
  });
};

// ─── getOrders ───────────────────────────────────────────────────────────────
export const getOrders = asyncHandler(async (req, res, next) => {
  const {
    userId,
    limit,
    page,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  let orders = null;

  if (!userId) {
    orders = await Order.find({})
      .limit(Number(limit))
      .skip(skip)
      .sort({ [sortBy]: sortOrder })
      .populate("shopId", "shopName phoneNumber address city governorate")
      .populate("traderId", "name phoneNumber")
      .populate("products.productId", "name price image");
  } else {
    orders = await Order.find({
      $or: [{ shopId: userId }, { traderId: userId }],
    })
      .limit(Number(limit))
      .skip(skip)
      .sort({ [sortBy]: sortOrder })
      .populate("shopId", "shopName")
      .populate("traderId", "name phoneNumber")
      .populate("products.productId", "name price image");
  }

  if (!orders || orders.length === 0) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Orders Not Found"));
  }

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, orders, "Orders Fetched Successfully"),
    );
});

// ─── updateOrderStatus ───────────────────────────────────────────────────────
export const updateOrderStatus = (io, socket) => {
  socket.on("updateOrderStatus", async (data) => {
    const order = await Order.findById(data.orderId);
    if (!order) {
      return socket.emit("error", "Order Not Found");
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      data.orderId,
      { status: data.status },
      { new: true },
    )
      .populate(
        "shopId",
        "shopName phoneNumber address city governorate username",
      )
      .populate("traderId", "name phoneNumber username shopName")
      .populate("products.productId", "name price image");

    if (!updatedOrder) {
      return socket.emit("error", "Order Not Updated");
    }

    // ── Cancel the pending timeout job — trader responded in time ──
    const traderIdStr = (
      updatedOrder.traderId?._id || updatedOrder.traderId
    )?.toString();

    if (traderIdStr) {
      await cancelOrderCheck(data.orderId, traderIdStr);
    }

    // ── Rank adjustments ──────────────────────────────────────────
    if (updatedOrder.status === "accepted") {
      const rank = calculateOrderRank(updatedOrder.products);
      await User.findByIdAndUpdate(
        updatedOrder.traderId,
        {
          $inc: { totalOrdersAccepted: 1, rank },
          $push: { ordersAccepted: updatedOrder._id },
        },
        { new: true },
      );
    } else if (updatedOrder.status === "rejected") {
      const rank = calculateOrderRank(updatedOrder.products);
      await User.findByIdAndUpdate(
        updatedOrder.traderId,
        {
          $inc: { totalOrdersAccepted: -1, rank: -rank },
          $pull: { ordersAccepted: updatedOrder._id },
        },
        { new: true },
      );
    }

    // ── Auto stock-in when order is delivered ─────────────────────
    // shopId is the retail user who placed the order.
    // products is an array of { productId, quantity, ... }.
    // autoStockInOnDelivery finds or creates the inventory record
    // for each product and adds the delivered quantity automatically.
    if (updatedOrder.status === "delivered") {
      const shopUserId = (updatedOrder.shopId?._id || updatedOrder.shopId)?.toString();

      if (shopUserId && updatedOrder.products?.length) {
        // Normalise to plain { productId, quantity } pairs
        const products = updatedOrder.products.map((p) => ({
          productId: (p.productId?._id || p.productId)?.toString(),
          quantity: p.quantity,
        }));

        // Fire-and-forget — errors are logged but do NOT break the order flow
        autoStockInOnDelivery({ userId: shopUserId, products }).catch((err) =>
          console.error("[autoStockInOnDelivery] failed:", err.message),
        );
      }
    }

    // ── Emit to admin + trader ────────────────────────────────────
    io.to("admin").emit("updateOrderStatus", { order: updatedOrder });

    const socketId = onlineUsers.get(traderIdStr);
    if (socketId) {
      io.to(socketId).emit("updateOrderStatus", { order: updatedOrder });
    }
  });
};

// ─── deleteOrder ─────────────────────────────────────────────────────────────
export const deleteOrder = asyncHandler(async (req, res, next) => {
  const orderId = req.params.id;
  const order = await Order.findByIdAndDelete(orderId);
  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order Not Found"));
  }
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, order, "Order Deleted Successfully"));
});

// ─── getOrder ────────────────────────────────────────────────────────────────
export const getOrder = asyncHandler(async (req, res, next) => {
  const orderId = req.params.id;
  const order = await Order.findById(orderId)
    .populate("shopId", "username shopName phoneNumber address")
    .populate("traderId", "username shopName phoneNumber address")
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount");

  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order Not Found"));
  }
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, order, "Order Fetched Successfully"));
});

// ─── manualForwardOrder ──────────────────────────────────────────────────────
export const manualForwardOrder = (io, socket) => {
  socket.on("forwardOrder", async (orderId, traderId) => {
    console.log(await autoChooseTrader(Array.from(onlineUsers.keys())));
    const order = await Order.findById(orderId);
    if (!order) {
      return socket.emit("error", "Order Not Found");
    }

    // Cancel any existing timeout job for the previous trader
    const prevTraderId = (order.traderId?._id || order.traderId)?.toString();
    if (prevTraderId) {
      await cancelOrderCheck(orderId, prevTraderId);
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { traderId, status: "pending" },
      { new: true },
    );
    if (!updatedOrder) {
      return socket.emit("error", "Order Not Updated");
    }

    const populatedOrder = await Order.findById(orderId)
      .populate(
        "shopId",
        "shopName phoneNumber address city governorate username",
      )
      .populate("traderId", "name phoneNumber username shopName")
      .populate("products.productId", "name price image");

    // Emit to admin + new trader
    io.to("admin").emit("sendOrder", { order: populatedOrder });
    const socketId = onlineUsers.get(traderId);
    if (socketId) {
      io.to(socketId).emit("sendOrder", { order: populatedOrder });
    }

    // Schedule a new timeout check for the newly assigned trader
    const triedIds = prevTraderId ? [prevTraderId] : [];
    await enqueueOrderCheck(orderId, traderId, triedIds);
  });
};
