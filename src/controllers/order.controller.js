import Order from "../models/order.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";
import { onlineUsers } from "../../server.js";
import User from "../models/user.model.js";
import Product from "../models/product.model.js";
import Coupon from "../models/coupon.model.js";
import { calculateOrderRank } from "../utils/orderUtils.js";
import { enqueueOrderCheck, cancelOrderCheck } from "../utils/orderQueue.js";
import { autoChooseTrader } from "../utils/orderUtils.js";
import { autoStockInOnDelivery } from "./inventory.controller.js";
import { getPagination, getPaginationInfo } from "../utils/pagination.js";
import { logger } from "../utils/logger.js";

// ─── Create Order ───────────────────────────────────────────────────────────
export const createOrder = asyncHandler(async (req, res, next) => {
  const {
    shopId,
    products,
    totalPrice,
    totalQuantity,
    address,
    note,
    paymentMethod = "Cash",
    coupon,
  } = req.body;

  // Verify shop exists and is a user
  const shop = await User.findById(shopId);
  if (!shop || shop.role !== "user") {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid shop ID"));
  }

  // Validate and calculate products
  let calculatedTotalPrice = 0;
  let calculatedTotalQuantity = 0;

  for (const item of products) {
    const product = await Product.findById(item.productId);
    if (!product) {
      return next(new ApiError(StatusCodes.BAD_REQUEST, `Product ${item.productId} not found`));
    }

    calculatedTotalPrice += item.totalPrice;
    calculatedTotalQuantity += item.quantity;
  }

  // Validate totals match
  if (Math.abs(calculatedTotalPrice - totalPrice) > 0.01) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Total price mismatch"));
  }

  if (calculatedTotalQuantity !== totalQuantity) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Total quantity mismatch"));
  }

  // Apply coupon discount if provided
  let discountAmount = 0;
  let appliedCoupon = null;

  if (coupon) {
    const couponDoc = await Coupon.findById(coupon);
    if (!couponDoc) {
      return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid coupon"));
    }

    // Check if coupon is valid
    const now = new Date();
    if (couponDoc.expiryDate && couponDoc.expiryDate < now) {
      return next(new ApiError(StatusCodes.BAD_REQUEST, "Coupon has expired"));
    }

    // Calculate discount
    if (couponDoc.discountType === "percentage") {
      discountAmount = (totalPrice * couponDoc.discount) / 100;
    } else {
      discountAmount = couponDoc.discount;
    }

    appliedCoupon = coupon;
  }

  const finalTotalPrice = totalPrice - discountAmount;

  // Create order
  const orderData = {
    shopId,
    products,
    totalPrice: finalTotalPrice,
    totalQuantity,
    address: address || shop.address,
    note,
    paymentMethod,
    coupon: appliedCoupon,
  };

  const newOrder = await Order.create(orderData);

  if (!newOrder) {
    return next(new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to create order"));
  }

  // Populate order for response
  const populatedOrder = await Order.findById(newOrder._id)
    .populate("shopId", "username shopName phoneNumber address city governorate")
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType");

  logger.info(`Order created: ${newOrder._id} by user ${shopId}`);

  return res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse(StatusCodes.CREATED, populatedOrder, "Order created successfully"));
});

// ─── sendOrder ───────────────────────────────────────────────────────────────
export const sendOrder = (io, socket) => {
  socket.on("sendOrder", async (orderPayload) => {
    try {
      const { order: orderData } = orderPayload;

      if (!orderData || !orderData.shopId || !orderData.products) {
        return socket.emit("error", "Invalid order data");
      }

      // Validate shop exists
      const shop = await User.findById(orderData.shopId);
      if (!shop || shop.role !== "user") {
        return socket.emit("error", "Invalid shop");
      }

      // Validate products
      for (const item of orderData.products) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return socket.emit("error", `Product ${item.productId} not found`);
        }
      }

      const newOrder = await Order.create(orderData);

      if (!newOrder) {
        return socket.emit("error", "Failed to create order");
      }

      const populatedOrder = await Order.findById(newOrder._id)
        .populate("shopId", "username shopName phoneNumber address city governorate")
        .populate("products.productId", "name price image")
        .populate("coupon", "name discount discountType");

      // Emit to admin
      io.to("admin").emit("newOrder", { order: populatedOrder });

      // Auto-assign trader if available
      const onlineTraderIds = Array.from(onlineUsers.keys());
      const selectedTrader = await autoChooseTrader(onlineTraderIds);

      if (selectedTrader) {
        const traderId = selectedTrader._id.toString();

        await Order.findByIdAndUpdate(newOrder._id, { traderId });

        populatedOrder.traderId = selectedTrader;

        // Emit to trader
        const traderSocketId = onlineUsers.get(traderId);
        if (traderSocketId) {
          io.to(traderSocketId).emit("sendOrder", { order: populatedOrder });
        }

        // Schedule timeout check
        await enqueueOrderCheck(newOrder._id.toString(), traderId, []);
      }

      logger.info(`Order created: ${newOrder._id} for shop ${orderData.shopId}`);

      socket.emit("orderCreated", { order: populatedOrder });

    } catch (error) {
      logger.error("Error creating order:", error);
      socket.emit("error", "Failed to create order");
    }
  });
};
// ─── getOrderStats ───────────────────────────────────────────────────────────
export const getOrderStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // Get overall statistics
  const stats = await Order.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: "$totalPrice" },
        totalQuantity: { $sum: "$totalQuantity" },
        pendingOrders: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
        },
        acceptedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] }
        },
        rejectedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] }
        },
        shippedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "shipped"] }, 1, 0] }
        },
        deliveredOrders: {
          $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
        },
        cancelledOrders: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
        },
      }
    }
  ]);

  const orderStats = stats[0] || {
    totalOrders: 0,
    totalRevenue: 0,
    totalQuantity: 0,
    pendingOrders: 0,
    acceptedOrders: 0,
    rejectedOrders: 0,
    shippedOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
  };

  // Get daily statistics for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyStats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        ...dateFilter,
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        orders: { $sum: 1 },
        revenue: { $sum: "$totalPrice" },
        quantity: { $sum: "$totalQuantity" },
      }
    },
    {
      $sort: { "_id": 1 }
    }
  ]);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, {
      overall: orderStats,
      daily: dailyStats,
    }, "Order statistics fetched successfully"));
});

// ─── getUserOrderStats ───────────────────────────────────────────────────────
export const getUserOrderStats = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { startDate, endDate } = req.query;

  // Check permissions
  if (req.user.role !== "admin" && req.user.id !== userId) {
    return next(new ApiError(StatusCodes.FORBIDDEN, "Not authorized to view these statistics"));
  }

  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  const user = await User.findById(userId);
  if (!user) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "User not found"));
  }

  let matchCondition = { ...dateFilter };

  if (user.role === "user") {
    matchCondition.shopId = userId;
  } else if (user.role === "trader") {
    matchCondition.traderId = userId;
  }

  const stats = await Order.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: "$totalPrice" },
        totalQuantity: { $sum: "$totalQuantity" },
        pendingOrders: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
        },
        acceptedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] }
        },
        rejectedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] }
        },
        shippedOrders: {
          $sum: { $cond: [{ $eq: ["$status", "shipped"] }, 1, 0] }
        },
        deliveredOrders: {
          $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
        },
        cancelledOrders: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
        },
      }
    }
  ]);

  const userStats = stats[0] || {
    totalOrders: 0,
    totalRevenue: 0,
    totalQuantity: 0,
    pendingOrders: 0,
    acceptedOrders: 0,
    rejectedOrders: 0,
    shippedOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
  };

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, {
      user: {
        id: user._id,
        username: user.username,
        shopName: user.shopName,
        role: user.role,
      },
      statistics: userStats,
    }, "User order statistics fetched successfully"));
});
// ─── getOrders ───────────────────────────────────────────────────────────────
export const getOrders = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
    status,
    userId,
    startDate,
    endDate,
  } = req.query;

  const { skip, limit: enforcedLimit, page: currentPage } = getPagination(page, limit);

  // Build query
  let query = {};

  // Filter by user (shop or trader)
  if (userId) {
    query.$or = [{ shopId: userId }, { traderId: userId }];
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by date range
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  // Role-based filtering for non-admin users
  if (req.user && req.user.role !== "admin") {
    if (!query.$or) {
      query.$or = [];
    }
    query.$or.push({ shopId: req.user.id });

    if (req.user.role === "trader") {
      query.$or.push({ traderId: req.user.id });
    }
  }

  // Get total count for pagination
  const total = await Order.countDocuments(query);

  // Get orders with pagination
  const orders = await Order.find(query)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(enforcedLimit)
    .populate("shopId", "username shopName phoneNumber address city governorate")
    .populate("traderId", "username shopName phoneNumber address city governorate")
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType");

  const pagination = getPaginationInfo(total, currentPage, enforcedLimit);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, {
      orders,
      pagination
    }, "Orders fetched successfully"));
});

// ─── updateOrderStatus ───────────────────────────────────────────────────────
export const updateOrderStatus = (io, socket) => {
  socket.on("updateOrderStatus", async (data) => {
    try {
      const { orderId, status } = data;

      if (!orderId || !status) {
        return socket.emit("error", "Order ID and status are required");
      }

      // Validate status
      const validStatuses = ["pending", "accepted", "rejected", "shipped", "delivered", "cancelled"];
      if (!validStatuses.includes(status)) {
        return socket.emit("error", "Invalid order status");
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return socket.emit("error", "Order not found");
      }

      // Validate status transitions
      const currentStatus = order.status;
      const invalidTransitions = {
        accepted: ["pending", "rejected", "cancelled"],
        rejected: ["accepted", "shipped", "delivered"],
        shipped: ["pending", "rejected", "cancelled"],
        delivered: ["pending", "rejected", "cancelled", "shipped"],
        cancelled: ["shipped", "delivered"],
      };

      if (invalidTransitions[status] && invalidTransitions[status].includes(currentStatus)) {
        return socket.emit("error", `Cannot change status from ${currentStatus} to ${status}`);
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status },
        { new: true },
      )
        .populate("shopId", "username shopName phoneNumber address city governorate")
        .populate("traderId", "username shopName phoneNumber address city governorate")
        .populate("products.productId", "name price image")
        .populate("coupon", "name discount discountType");

      if (!updatedOrder) {
        return socket.emit("error", "Failed to update order");
      }

      // Cancel pending timeout job if trader responded
      const traderIdStr = (updatedOrder.traderId?._id || updatedOrder.traderId)?.toString();
      if (traderIdStr && (status === "accepted" || status === "rejected")) {
        await cancelOrderCheck(orderId, traderIdStr);
      }

      // Update trader rankings and statistics
      if (status === "accepted" && traderIdStr) {
        const rank = calculateOrderRank(updatedOrder.products);
        await User.findByIdAndUpdate(
          traderIdStr,
          {
            $inc: { totalOrdersAccepted: 1, rank },
            $push: { ordersAccepted: updatedOrder._id },
          },
          { new: true },
        );
        logger.info(`Order ${orderId} accepted by trader ${traderIdStr}, rank increased by ${rank}`);
      } else if (status === "rejected" && traderIdStr) {
        const rank = calculateOrderRank(updatedOrder.products);
        await User.findByIdAndUpdate(
          traderIdStr,
          {
            $inc: { totalOrdersRejected: 1, rank: -rank },
            $pull: { ordersAccepted: updatedOrder._id },
            $push: { ordersRejected: updatedOrder._id },
          },
          { new: true },
        );
        logger.info(`Order ${orderId} rejected by trader ${traderIdStr}, rank decreased by ${rank}`);
      }

      // Auto stock-in when order is delivered
      if (status === "delivered") {
        const shopUserId = (updatedOrder.shopId?._id || updatedOrder.shopId)?.toString();

        if (shopUserId && updatedOrder.products?.length) {
          const products = updatedOrder.products.map((p) => ({
            productId: (p.productId?._id || p.productId)?.toString(),
            quantity: p.quantity,
          }));

          autoStockInOnDelivery({ userId: shopUserId, products }).catch((err) => {
            logger.error(`[autoStockInOnDelivery] failed for order ${orderId}:`, err.message);
          });
        }
      }

      // Emit updates to admin and trader
      io.to("admin").emit("updateOrderStatus", { order: updatedOrder });

      if (traderIdStr) {
        const socketId = onlineUsers.get(traderIdStr);
        if (socketId) {
          io.to(socketId).emit("updateOrderStatus", { order: updatedOrder });
        }
      }

      // Emit to shop owner
      const shopIdStr = (updatedOrder.shopId?._id || updatedOrder.shopId)?.toString();
      if (shopIdStr) {
        const shopSocketId = onlineUsers.get(shopIdStr);
        if (shopSocketId) {
          io.to(shopSocketId).emit("orderStatusUpdate", { order: updatedOrder });
        }
      }

      logger.info(`Order ${orderId} status updated to ${status}`);

    } catch (error) {
      logger.error("Error updating order status:", error);
      socket.emit("error", "Failed to update order status");
    }
  });
};

// ─── deleteOrder ─────────────────────────────────────────────────────────────
export const deleteOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findById(id);
  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order not found"));
  }

  // Check permissions - only admin or the shop owner can delete
  if (req.user.role !== "admin" && order.shopId.toString() !== req.user.id) {
    return next(new ApiError(StatusCodes.FORBIDDEN, "Not authorized to delete this order"));
  }

  // Only allow deletion of pending orders
  if (order.status !== "pending") {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Can only delete pending orders"));
  }

  // Cancel any pending timeout job
  const traderIdStr = order.traderId?.toString();
  if (traderIdStr) {
    await cancelOrderCheck(id, traderIdStr);
  }

  await Order.findByIdAndDelete(id);

  logger.info(`Order ${id} deleted by user ${req.user.id}`);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, "Order deleted successfully"));
});

// ─── updateOrder ─────────────────────────────────────────────────────────────
export const updateOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  const order = await Order.findById(id);
  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order not found"));
  }

  // Check permissions - only admin or the shop owner can update
  if (req.user.role !== "admin" && order.shopId.toString() !== req.user.id) {
    return next(new ApiError(StatusCodes.FORBIDDEN, "Not authorized to update this order"));
  }

  // Only allow updates to pending orders
  if (order.status !== "pending") {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Can only update pending orders"));
  }

  // Validate products if being updated
  if (updateData.products) {
    let calculatedTotalPrice = 0;
    let calculatedTotalQuantity = 0;

    for (const item of updateData.products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return next(new ApiError(StatusCodes.BAD_REQUEST, `Product ${item.productId} not found`));
      }

      calculatedTotalPrice += item.totalPrice;
      calculatedTotalQuantity += item.quantity;
    }

    updateData.totalPrice = calculatedTotalPrice;
    updateData.totalQuantity = calculatedTotalQuantity;
  }

  const updatedOrder = await Order.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("shopId", "username shopName phoneNumber address city governorate")
    .populate("traderId", "username shopName phoneNumber address city governorate")
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType");

  if (!updatedOrder) {
    return next(new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to update order"));
  }

  logger.info(`Order ${id} updated by user ${req.user.id}`);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, updatedOrder, "Order updated successfully"));
});

// ─── getOrder ────────────────────────────────────────────────────────────────
export const getOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findById(id)
    .populate("shopId", "username shopName phoneNumber address city governorate")
    .populate("traderId", "username shopName phoneNumber address city governorate")
    .populate("products.productId", "name price image description")
    .populate("coupon", "name discount discountType expiryDate");

  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order not found"));
  }

  // Check permissions - user can only see their own orders
  if (req.user.role !== "admin" &&
      order.shopId._id.toString() !== req.user.id &&
      order.traderId?._id?.toString() !== req.user.id) {
    return next(new ApiError(StatusCodes.FORBIDDEN, "Not authorized to view this order"));
  }

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, order, "Order fetched successfully"));
});

// ─── forwardOrder ────────────────────────────────────────────────────────────
export const forwardOrder = asyncHandler(async (req, res, next) => {
  const { orderId, traderId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order not found"));
  }

  // Check if order is still pending
  if (order.status !== "pending") {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Order is not pending"));
  }

  // Verify trader exists and is online
  const trader = await User.findById(traderId);
  if (!trader || trader.role !== "trader") {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid trader"));
  }

  if (!trader.isOnline) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Trader is not online"));
  }

  // Cancel any existing timeout job
  const prevTraderId = order.traderId?.toString();
  if (prevTraderId) {
    await cancelOrderCheck(orderId, prevTraderId);
  }

  // Update order with new trader
  const updatedOrder = await Order.findByIdAndUpdate(
    orderId,
    { traderId, status: "pending" },
    { new: true },
  )
    .populate("shopId", "username shopName phoneNumber address city governorate")
    .populate("traderId", "username shopName phoneNumber address city governorate")
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType");

  if (!updatedOrder) {
    return next(new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to forward order"));
  }

  // Schedule new timeout check
  const triedIds = prevTraderId ? [prevTraderId] : [];
  await enqueueOrderCheck(orderId, traderId, triedIds);

  logger.info(`Order ${orderId} forwarded to trader ${traderId} by user ${req.user.id}`);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, updatedOrder, "Order forwarded successfully"));
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
