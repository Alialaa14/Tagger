import Order from "../models/order.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";
import { onlineUsers } from "../../server.js";
import User from "../models/user.model.js";
import Product from "../models/product.model.js";
import TraderProduct from "../models/traderProduct.js";
import Coupon from "../models/coupon.model.js";
import { calculateOrderRank, findBestTrader } from "../utils/orderUtils.js";
import { enqueueOrderCheck, cancelOrderCheck } from "../utils/orderQueue.js";
import { autoStockInOnDelivery } from "./inventory.controller.js";
import { getPagination, getPaginationInfo } from "../utils/pagination.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { getPlatformSettings } from "../utils/settingsHelper.js";
import { logger } from "../utils/logger.js";
import mongoose from "mongoose";
import { updateCoupon } from "./coupon.controller.js";

// ─── Stats Helper ───────────────────────────────────────────────────────────
const getComprehensiveOrderStats = async (matchFilter = {}, revenueField = "$totalPrice") => {
  const statusAggregation = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        revenue: { $sum: revenueField },
        quantity: { $sum: "$totalQuantity" },
      },
    },
  ]);

  const initialStats = {
    total: 0,
    totalRevenue: 0,
    grossRevenue: 0,
    totalQuantity: 0,
    statuses: {},
  };

  const definedStatuses = ["pending", "accepted", "rejected", "shipped", "delivered", "cancelled"];
  definedStatuses.forEach(s => {
    const defaultData = { count: 0, revenue: 0, quantity: 0 };
    initialStats.statuses[s] = defaultData;
    initialStats[s] = defaultData; // Compatible with component?.pending?.count
    initialStats[`${s}Orders`] = 0;
    initialStats[`${s}Revenue`] = 0;
    initialStats[`${s}Quantity`] = 0;
  });

  const orderStats = statusAggregation.reduce((acc, item) => {
    const status = item._id;
    acc.total += item.count;
    acc.totalQuantity += item.quantity;
    acc.grossRevenue += item.revenue;

    if (status === "delivered") {
      acc.totalRevenue += item.revenue;
    }

    if (acc.statuses[status]) {
      const data = {
        count: item.count,
        revenue: item.revenue,
        quantity: item.quantity,
      };
      acc.statuses[status] = data;
      acc[status] = data; // Compatible with component?.pending?.count

      // Flattened
      acc[`${status}Orders`] = item.count;
      acc[`${status}Revenue`] = item.revenue;
      acc[`${status}Quantity`] = item.quantity;
    }
    return acc;
  }, initialStats);

  // Daily Stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyStats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        ...matchFilter,
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        orders: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [{ $eq: ["$status", "delivered"] }, revenueField, 0],
          },
        },
        quantity: { $sum: "$totalQuantity" },
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        accepted: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
        shipped: { $sum: { $cond: [{ $eq: ["$status", "shipped"] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    overall: orderStats,
    daily: dailyStats
  };
};

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

  // Handle Payment Proof if Digital
  let paymentProof = null;
  let paymentStatus = "not_applicable";

  const settings = await getPlatformSettings();

  if (paymentMethod === "Digital") {
    if (settings.requirePaymentProof && !req.file) {
      return next(new ApiError(StatusCodes.BAD_REQUEST, "Payment proof (screenshot) is required for Digital payment"));
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file.path, `Tagger/orders/proofs/${shop.username}`);
      paymentProof = {
        public_id: result.public_id,
        url: result.secure_url,
      };
      paymentStatus = "pending";
    } else {
      // If payment proof is NOT required but it's digital, we might still mark it as pending
      paymentStatus = "pending";
    }
  }

  // Validate products and pricing locally
  let calculatedTotalPrice = 0;
  for (const item of products) {
    const product = await Product.findById(item.productId);
    if (!product) return next(new ApiError(StatusCodes.BAD_REQUEST, `Product ${item.productId} not found`));
    calculatedTotalPrice += item.totalPrice;
  }

  // Applied Coupon check
  let discountAmount = 0;
  let appliedCoupon = null;
  if (coupon) {
    const couponDoc = await Coupon.findById(coupon);
    if (couponDoc && (!couponDoc.expiry || couponDoc.expiry > new Date())) {
      // User confirmed: Fixed amount discount only
      discountAmount = couponDoc.discount;
      appliedCoupon = coupon;

      if (couponDoc.usedCount >= couponDoc.maxUse || couponDoc.isUsed) {
        return next(new ApiError(StatusCodes.BAD_REQUEST, "تم الوصول إلى الحد الأقصى لاستخدام الكوبون"));
      }

      // Mark as used
      couponDoc.usedCount += 1;
      couponDoc.usedBy.push(shop._id);
      if (couponDoc.usedCount >= couponDoc.maxUse) {
        couponDoc.isUsed = true;
      }
      await couponDoc.save();
    }
  }

  const finalPrice = Math.max(0, calculatedTotalPrice - discountAmount);

  // Create order
  const newOrder = await Order.create({
    shopId,
    products,
    totalPrice: finalPrice,
    totalQuantity,
    address: address || shop.address,
    note,
    paymentMethod,
    coupon: appliedCoupon,
    paymentProof,
    paymentStatus,
    history: [{ phase: "pending", doneBy: shopId }]
  });

  if (!newOrder) return next(new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to create order"));

  // [Smart Forwarding] If Cash or Online Payment is verified (not verified yet here), try to assign trader
  // Only trigger if autoForward is enabled
  if (paymentMethod === "Cash" && settings.autoForward) {
    const eligibleTraders = await findBestTrader(products, [], finalPrice);
    if (eligibleTraders && eligibleTraders.length > 0) {
      const { trader, totalTraderPrice, products: updatedProducts } = eligibleTraders[0];
      await Order.findByIdAndUpdate(newOrder._id, {
        traderId: trader._id,
        totalTraderPrice,
        products: updatedProducts,
        $push: {
          history: { phase: "auto forward", doneBy: null },
          triedTraderIds: trader._id
        }
      });
      await enqueueOrderCheck(newOrder._id.toString(), trader._id.toString());
    }
  }

  const populatedOrder = await Order.findById(newOrder._id)
    .populate("shopId", "username shopName phoneNumber address city governorate")
    .populate("traderId", "username shopName phoneNumber")
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType");

  const formattedOrder = populatedOrder.toObject();
  formattedOrder.history = await populatedOrder.getFormattedHistory();

  return res.status(StatusCodes.CREATED).json(new ApiResponse(StatusCodes.CREATED, formattedOrder, "Order created successfully"));
});

// ─── sendOrder (Socket) ────────────────────────────────────────────────────────
export const sendOrder = (io, socket) => {
  socket.on("sendOrder", async (orderPayload) => {
    try {
      const { order: orderData } = orderPayload;

      if (!orderData || !orderData.shopId || !orderData.products) {
        return socket.emit("error", "بيانات الطلب غير صالحة");
      }

      const shop = await User.findById(orderData.shopId);
      if (!shop) return socket.emit("error", "المتجر غير موجود");

      const newOrder = await Order.create({
        ...orderData,
        history: [{ phase: "pending", doneBy: orderData.shopId }]
      });

      if (!newOrder) return socket.emit("error", "فشل في إنشاء الطلب");

      // [Smart Forwarding]
      const settings = await getPlatformSettings();

      if (newOrder.paymentMethod === "Cash" && settings.autoForward) {
        const eligibleTraders = await findBestTrader(newOrder.products, [], newOrder.totalPrice);
        if (eligibleTraders && eligibleTraders.length > 0) {
          const { trader, totalTraderPrice, products: updatedProducts } = eligibleTraders[0];
          const traderIdStr = trader._id.toString();

          await Order.findByIdAndUpdate(newOrder._id, {
            traderId: trader._id,
            totalTraderPrice,
            products: updatedProducts,
            $push: { history: { phase: "auto forward", doneBy: trader._id } }
          });

          const populatedOrder = await Order.findById(newOrder._id)
            .populate("shopId", "username shopName phoneNumber address city governorate")
            .populate("traderId", "name phoneNumber username shopName")
            .populate("products.productId", "name price image");

          const formattedPopulated = populatedOrder.toObject();
          formattedPopulated.history = await populatedOrder.getFormattedHistory();

          // Notify Trader
          const traderSocketId = onlineUsers.get(traderIdStr);
          if (traderSocketId) {
            io.to(traderSocketId).emit("sendOrder", { order: formattedPopulated });
          }
          await enqueueOrderCheck(newOrder._id.toString(), traderIdStr, []);
        }
      }

      const finalPopulated = await Order.findById(newOrder._id)
        .populate("shopId", "username shopName phoneNumber address city governorate")
        .populate("traderId", "name phoneNumber username shopName")
        .populate("products.productId", "name price image");

      const formattedFinal = finalPopulated.toObject();
      formattedFinal.history = await finalPopulated.getFormattedHistory();

      io.to("admin").emit("newOrder", { order: formattedFinal });
      socket.emit("orderCreated", { order: formattedFinal });

    } catch (error) {
      logger.error("Error in sendOrder socket:", error);
      socket.emit("error", "حدث خطأ أثناء إرسال الطلب");
    }
  });
};


// ─── getOrderStats ───────────────────────────────────────────────────────────
export const getOrderStats = asyncHandler(async (req, res, next) => {
  const {
    startDate,
    endDate,
    shopId,
    traderId,
    paymentMethod,
    paymentStatus,
    city,
    search,
  } = req.query;

  // 1. Build dynamic match filter
  let matchFilter = {};

  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }

  if (shopId) matchFilter.shopId = new mongoose.Types.ObjectId(shopId);
  if (traderId) matchFilter.traderId = new mongoose.Types.ObjectId(traderId);
  if (paymentMethod) matchFilter.paymentMethod = paymentMethod;
  if (paymentStatus) matchFilter.paymentStatus = paymentStatus;
  if (city) matchFilter.city = { $regex: city, $options: "i" };

  if (search) {
    matchFilter.$or = [
      { customerName: { $regex: search, $options: "i" } },
      { customerPhone: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
      { note: { $regex: search, $options: "i" } },
    ];
    if (mongoose.Types.ObjectId.isValid(search)) {
      matchFilter.$or.push({ _id: new mongoose.Types.ObjectId(search) });
    }
  }

  // 2. Get comprehensive statistics
  const stats = await getComprehensiveOrderStats(matchFilter);

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      stats,
      "Order statistics fetched successfully",
    ),
  );
});

// ─── getUserOrderStats ───────────────────────────────────────────────────────
export const getUserOrderStats = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { startDate, endDate } = req.query;

  // ── Permission check ──────────────────────────────────────
  const existedUser = await User.findById(req.user.id);
  if (existedUser.role !== "admin" && req.user.id !== userId)
    return next(new ApiError(StatusCodes.FORBIDDEN, "Not authorized to view these statistics"));

  // ── Target user ───────────────────────────────────────────
  const user = await User.findById(userId);
  if (!user)
    return next(new ApiError(StatusCodes.NOT_FOUND, "User not found"));

  // ── Date filter (same as getOrderStats) ───────────────────
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // ── Role-based match condition ────────────────────────────
  let matchCondition = { ...dateFilter };
  if (user.role === "user") matchCondition.shopId = new mongoose.Types.ObjectId(userId);
  if (user.role === "trader") matchCondition.traderId = new mongoose.Types.ObjectId(userId);

  // ── Stats ───────────────────────────────────────────────
  const targetRevenueField = user.role === "trader" ? "$totalTraderPrice" : "$totalPrice";
  const stats = await getComprehensiveOrderStats(matchCondition, targetRevenueField);

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        user: {
          id: user._id,
          username: user.username,
          shopName: user.shopName,
          role: user.role,
        },
        ...stats,
      },
      "User order statistics fetched successfully",
    ),
  );
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
    shopId,
    traderId,
    city,
    search,
    startDate,
    endDate,
  } = req.query;

  const {
    skip,
    limit: enforcedLimit,
    page: currentPage,
  } = getPagination(page, limit);

  // 1. Build Base Query
  let baseQuery = {};

  if (startDate || endDate) {
    baseQuery.createdAt = {};
    if (startDate) baseQuery.createdAt.$gte = new Date(startDate);
    if (endDate) baseQuery.createdAt.$lte = new Date(endDate);
  }

  // User-specific filtering (userId, shopId, traderId)
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid userId"))
    }
    const userObjId = new mongoose.Types.ObjectId(userId)
    baseQuery.$or = [{ shopId: userObjId }, { traderId: userObjId }]
  }
  else {
    if (shopId) baseQuery.shopId = new mongoose.Types.ObjectId(shopId)
    if (traderId) baseQuery.traderId = new mongoose.Types.ObjectId(traderId)
  }

  if (city) baseQuery.city = { $regex: city, $options: "i" };

  if (search) {
    const searchConditions = [
      { customerName: { $regex: search, $options: "i" } },
      { customerPhone: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
    ];
    if (mongoose.Types.ObjectId.isValid(search)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(search) });
    }

    if (baseQuery.$or) {
      // If we already have $or (from userId), we need to $and it with search
      baseQuery = { $and: [baseQuery, { $or: searchConditions }] };
    } else {
      baseQuery.$or = searchConditions;
    }
  }

  // Role-based enforcement (Mandatory for non-admins)
  // Role-based enforcement
  const user = await User.findById(req.user.id)
  if (user && user.role !== "admin") {
    const currentUserObjId = new mongoose.Types.ObjectId(req.user.id)
    const roleFilter = { $or: [{ shopId: currentUserObjId }] }
    if (user.role === "trader") {
      roleFilter.$or.push({ traderId: currentUserObjId })
    }

    baseQuery = Object.keys(baseQuery).length > 0
      ? { $and: [baseQuery, roleFilter] }
      : roleFilter
  }
  console.log(baseQuery)
  // 2. Aggregate counts and financial sums by status based on current filters (EXCEPT status itself)
  const isTrader = user.role === "trader";
  const revenueField = isTrader ? "$totalTraderPrice" : "$totalPrice";

  const statusAggregation = await Order.aggregate([
    { $match: baseQuery },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalRevenue: { $sum: revenueField },
        totalQuantity: { $sum: "$totalQuantity" },
      },
    },
  ]);

  console.log(statusAggregation)
  // Initialize status stats
  const statusCounts = {
    total: 0,
    totalRevenue: 0,
    grossRevenue: 0,
    totalQuantity: 0,
  };

  const definedStatuses = ["pending", "accepted", "rejected", "shipped", "delivered", "cancelled"];
  definedStatuses.forEach(s => {
    statusCounts[s] = { count: 0, revenue: 0, qty: 0 };
  });

  statusAggregation.forEach((item) => {
    if (item._id && statusCounts[item._id]) {
      const statusData = {
        count: item.count,
        revenue: item.totalRevenue,
        qty: item.totalQuantity,
      };
      statusCounts[item._id] = statusData;
      statusCounts.total += item.count;
      statusCounts.totalQuantity += item.totalQuantity;
      statusCounts.grossRevenue += item.totalRevenue;

      // Only delivered orders count toward total revenue (Net Revenue)
      if (item._id === "delivered") {
        statusCounts.totalRevenue += item.totalRevenue;
      }
    }
  });

  // 3. Apply final status filter for the actual order list
  let finalQuery = { ...baseQuery };
  // If we converted baseQuery to $and structure, we must append to it
  if (status) {
    if (finalQuery.$and) {
      finalQuery.$and.push({ status });
    } else {
      finalQuery.status = status;
    }
  }

  // 4. Fetch Paginated Results
  const total = await Order.countDocuments(finalQuery);
  const orders = await Order.find(finalQuery)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(enforcedLimit)
    .populate("shopId", "username shopName phoneNumber address city governorate")
    .populate("traderId", "username shopName phoneNumber address city governorate")
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType")
    .populate("history.doneBy", "username shopName role");

  const formattedOrders = await Promise.all(orders.map(async (order) => {
    const orderObj = order.toObject();
    orderObj.history = await order.getFormattedHistory();
    return orderObj;
  }));

  const pagination = getPaginationInfo(total, currentPage, enforcedLimit);

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        total,
        statusCounts,
        orders: formattedOrders,
        pagination,
      },
      "Orders fetched successfully",
    ),
  );
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
      const validStatuses = [
        "pending",
        "accepted",
        "rejected",
        "shipped",
        "delivered",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        return socket.emit("error", "Invalid order status");
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return socket.emit("error", "Order not found");
      }

      // Validate status transitions based on custom rules
      const currentStatus = order.status;
      let isValidTransition = true;
      let errorMessage = `Cannot change status from ${currentStatus} to ${status}`;

      if (status === "shipped" && currentStatus !== "accepted") {
        isValidTransition = false;
        errorMessage = "Order can only be shipped if it is currently accepted";
      } else if (status === "delivered" && currentStatus !== "shipped") {
        isValidTransition = false;
        errorMessage = "Order can only be delivered if it is currently shipped";
      } else if (status === "rejected" && currentStatus !== "pending") {
        isValidTransition = false;
        errorMessage = "Order can only be rejected if it is currently pending";
      } else if (status === "cancelled" && ["shipped", "delivered"].includes(currentStatus)) {
        isValidTransition = false;
        errorMessage = "Order cannot be cancelled if it has already been shipped or delivered";
      } else if (status === "accepted" && currentStatus !== "pending") {
        isValidTransition = false;
        errorMessage = "Order can only be accepted if it is currently pending";
      }

      if (!isValidTransition) {
        return socket.emit("error", errorMessage);
      }

      if (["rejected", "cancelled"].includes(status) && order.coupon) {
        const couponDoc = await Coupon.findById(order.coupon);
        if (couponDoc) {
          couponDoc.usedCount = Math.max(0, couponDoc.usedCount - 1);
          const shopIdStr = (order.shopId?._id || order.shopId)?.toString();
          const idx = couponDoc.usedBy.findIndex(id => id.toString() === shopIdStr);
          if (idx > -1) couponDoc.usedBy.splice(idx, 1);
          if (couponDoc.usedCount < couponDoc.maxUse) couponDoc.isUsed = false;
          await couponDoc.save();
        }
      }


      const updatedOrder = await Order.findOneAndUpdate(
        { _id: orderId, status: currentStatus },
        {
          status,
          $push: { history: { phase: status, doneBy: socket.user } }
        },
        { new: true },
      )
        .populate(
          "shopId",
          "username shopName phoneNumber address city governorate",
        )
        .populate(
          "traderId",
          "username shopName phoneNumber address city governorate",
        )
        .populate("products.productId", "name price image")
        .populate("coupon", "name discount discountType");


      if (status === "delivered") {
        const updatedCoupon = await Coupon.findByIdAndUpdate(order.coupon, { $push: { usedBy: updatedOrder.shopId }, $inc: { usedCount: 1 } }, { new: true })
      }
      if (!updatedOrder) {
        return socket.emit("error", "تم تحديث حالة الطلب بالفعل بواسطة طلب آخر");
      }

      // Cancel pending timeout job if trader responded
      const traderIdStr = (
        updatedOrder.traderId?._id || updatedOrder.traderId
      )?.toString();
      if (traderIdStr && (status === "accepted" || status === "rejected")) {
        await cancelOrderCheck(orderId, traderIdStr);
      }

      // ─── Automatic Sequential Forwarding on Rejection ─────────
      if (status === "rejected" && traderIdStr) {
        const user = await User.findById(socket.user);
        if (user && user.role === "trader") {
          logger.info(`Trader ${traderIdStr} rejected order ${orderId}. Searching for next available trader...`);

          // Add current trader to tried list in DB
          const currentOrder = await Order.findByIdAndUpdate(orderId, {
            $addToSet: { triedTraderIds: traderIdStr }
          }, { new: true });

          const eligibleTraders = await findBestTrader(
            currentOrder.products,
            currentOrder.triedTraderIds,
            currentOrder.totalPrice
          );


          if (eligibleTraders && eligibleTraders.length > 0) {
            const nextTraderResult = eligibleTraders[0];
            const nextTrader = nextTraderResult.trader;

            const reforwardedOrder = await Order.findByIdAndUpdate(orderId, {
              status: "pending", // Keep it pending!
              traderId: nextTrader._id,
              totalTraderPrice: nextTraderResult.totalTraderPrice,
              products: nextTraderResult.products,
              $push: {
                history: { phase: "reforward", doneBy: socket.user },
                triedTraderIds: nextTrader._id
              }
            }, { new: true })
              .populate("shopId", "username shopName phoneNumber address city governorate")
              .populate("traderId", "name phoneNumber username shopName")
              .populate("products.productId", "name price image");

            const formattedOrder = reforwardedOrder.toObject();
            formattedOrder.history = await reforwardedOrder.getFormattedHistory();

            // Notify Admin and New Trader
            io.to("admin").emit("updateOrderStatus", { order: formattedOrder });
            const nextTraderSocketId = onlineUsers.get(nextTrader._id.toString());
            if (nextTraderSocketId) {
              io.to(nextTraderSocketId).emit("sendOrder", { order: formattedOrder });
            }

            // Enqueue check for new trader
            await enqueueOrderCheck(orderId, nextTrader._id.toString());

            logger.info(`Order ${orderId} automatically reforwarded to ${nextTrader._id}`);
            return; // EXIT early, we've handled the re-forwarding
          } else {
            logger.info(`No more eligible traders for order ${orderId}. Finalizing rejection.`);
            socket.emit("error", {
              message: "لا يوجد تجار متاحون لتنفيذ هذا الطلب حالياً",
              orderId: orderId
            });
          }
        }
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
        logger.info(
          `Order ${orderId} accepted by trader ${traderIdStr}, rank increased by ${rank}`,
        );
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
        logger.info(
          `Order ${orderId} rejected by trader ${traderIdStr}, rank decreased by ${rank}`,
        );
      }

      // Auto stock-in and update sales when order is delivered
      if (status === "delivered") {
        const shopUserId = (
          updatedOrder.shopId?._id || updatedOrder.shopId
        )?.toString();
        const traderIdStr = (
          updatedOrder.traderId?._id || updatedOrder.traderId
        )?.toString();

        if (shopUserId && updatedOrder.products?.length) {
          const products = updatedOrder.products.map((p) => ({
            productId: (p.productId?._id || p.productId)?.toString(),
            quantity: p.quantity,
          }));

          autoStockInOnDelivery({ userId: shopUserId, products }).catch(
            (err) => {
              logger.error(
                `[autoStockInOnDelivery] failed for order ${orderId} for reason : ${err.message}`,
              );
            },
          );

          // Update Shop totalSales
          await User.findByIdAndUpdate(shopUserId, {
            $inc: { totalSales: updatedOrder.totalPrice }
          });
        }

        // Update Trader totalSales
        if (traderIdStr) {
          await User.findByIdAndUpdate(traderIdStr, {
            $inc: { totalSales: updatedOrder.totalTraderPrice }
          });
        }

        // Increment every product of the order to its sold and totalSales
        if (updatedOrder.products?.length) {
          const productUpdates = updatedOrder.products.map((item) => {
            return Product.findByIdAndUpdate(item.productId, {
              $inc: {
                sold: item.quantity,
                totalSales: item.totalPrice,
              },
            });
          });
          await Promise.all(productUpdates);
        }
      }

      const formattedOrder = updatedOrder.toObject();
      formattedOrder.history = await updatedOrder.getFormattedHistory();

      // ─── Personalized Stats Emitters ──────────────────────────
      // 1. Admin: Global stats
      const adminStats = await getComprehensiveOrderStats();
      io.to("admin").emit("updateOrderStatus", { order: formattedOrder, stats: adminStats });

      // 2. Trader: Trader-specific stats
      if (traderIdStr) {
        const traderSocketId = onlineUsers.get(traderIdStr);
        if (traderSocketId) {
          const traderStats = await getComprehensiveOrderStats(
            { traderId: new mongoose.Types.ObjectId(traderIdStr) },
            "$totalTraderPrice"
          );
          io.to(traderSocketId).emit("updateOrderStatus", { order: formattedOrder, stats: traderStats });
        }
      }

      // 3. Shop: Shop-specific stats
      const shopIdStr = (updatedOrder.shopId?._id || updatedOrder.shopId)?.toString();
      if (shopIdStr) {
        const shopSocketId = onlineUsers.get(shopIdStr);
        if (shopSocketId) {
          const shopStats = await getComprehensiveOrderStats(
            { shopId: new mongoose.Types.ObjectId(shopIdStr) }
          );
          io.to(shopSocketId).emit("orderStatusUpdate", { order: formattedOrder, stats: shopStats });
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
  const user = await User.findById(req.user.id);

  // Check permissions - only admin or the shop owner can delete
  if (user.role !== "admin" && order.shopId.toString() !== req.user.id) {
    return next(
      new ApiError(
        StatusCodes.FORBIDDEN,
        "Not authorized to delete this order",
      ),
    );
  }

  // Only allow deletion of pending orders
  if (user.role !== "admin" && order.status !== "pending") {
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Can only delete pending orders"),
    );
  }

  // Cancel any pending timeout job
  const traderIdStr = order.traderId?.toString();
  if (traderIdStr) {
    await cancelOrderCheck(id, traderIdStr);
  }

  if (order.status === "pending" && order.coupon) {
    const couponDoc = await Coupon.findById(order.coupon);
    if (couponDoc) {
      couponDoc.usedCount = Math.max(0, couponDoc.usedCount - 1);
      const shopIdStr = (order.shopId?._id || order.shopId)?.toString();
      const idx = couponDoc.usedBy.findIndex(id => id.toString() === shopIdStr);
      if (idx > -1) couponDoc.usedBy.splice(idx, 1);
      if (couponDoc.usedCount < couponDoc.maxUse) couponDoc.isUsed = false;
      await couponDoc.save();
    }
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
  const updateData = { ...req.body };

  if (updateData.orderNote !== undefined) {
    updateData.note = updateData.orderNote;
    delete updateData.orderNote;
  }

  // Prevent users from changing sensitive fields
  if (req.user.role !== "admin") {
    delete updateData.totalPrice;
    delete updateData.totalQuantity;
    delete updateData.traderId;
    delete updateData.totalTraderPrice;
    delete updateData.paymentStatus;

    // Users can only change status to "cancelled"
    if (updateData.status && updateData.status !== "cancelled") {
      delete updateData.status;
    }
  }

  const order = await Order.findById(id);
  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order not found"));
  }
  const user = await User.findById(req.user.id);
  // Check permissions - only admin or the shop owner can update
  if (user.role !== "admin" && order.shopId.toString() !== req.user.id) {
    return next(
      new ApiError(
        StatusCodes.FORBIDDEN,
        "Not authorized to update this order",
      ),
    );
  }

  // Only allow updates to pending orders for non-admin
  if (user.role !== "admin" && order.status !== "pending") {
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Can only update pending orders"),
    );
  }

  // Validate custom status transitions if admin (or user changing to cancelled) is updating status
  if (updateData.status && updateData.status !== order.status) {
    const status = updateData.status;
    const currentStatus = order.status;
    let isValidTransition = true;
    let errorMessage = `Cannot change status from ${currentStatus} to ${status}`;

    if (status === "shipped" && currentStatus !== "accepted") {
      isValidTransition = false;
      errorMessage = "Order can only be shipped if it is currently accepted";
    } else if (status === "delivered" && currentStatus !== "shipped") {
      isValidTransition = false;
      errorMessage = "Order can only be delivered if it is currently shipped";
    } else if (status === "rejected" && currentStatus !== "pending") {
      isValidTransition = false;
      errorMessage = "Order can only be rejected if it is currently pending";
    } else if (status === "cancelled" && ["shipped", "delivered"].includes(currentStatus)) {
      isValidTransition = false;
      errorMessage = "Order cannot be cancelled if it has already been shipped or delivered";
    } else if (status === "accepted" && currentStatus !== "pending") {
      isValidTransition = false;
      errorMessage = "Order can only be accepted if it is currently pending";
    }

    if (!isValidTransition) {
      return next(new ApiError(StatusCodes.BAD_REQUEST, errorMessage));
    }

    updateData.$push = { history: { phase: status, doneBy: req.user.id } };

    if (["rejected", "cancelled"].includes(status) && order.coupon) {
      const couponDoc = await Coupon.findById(order.coupon);
      if (couponDoc) {
        couponDoc.usedCount = Math.max(0, couponDoc.usedCount - 1);
        const shopIdStr = (order.shopId?._id || order.shopId)?.toString();
        const idx = couponDoc.usedBy.findIndex(id => id.toString() === shopIdStr);
        if (idx > -1) couponDoc.usedBy.splice(idx, 1);
        if (couponDoc.usedCount < couponDoc.maxUse) couponDoc.isUsed = false;
        await couponDoc.save();
      }
    }
  }

  // Validate products if being updated
  if (updateData.products) {
    let calculatedTotalPrice = 0;
    let calculatedTotalQuantity = 0;

    for (const item of updateData.products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return next(
          new ApiError(
            StatusCodes.BAD_REQUEST,
            `Product ${item.productId} not found`,
          ),
        );
      }

      calculatedTotalPrice += item.totalPrice;
      calculatedTotalQuantity += item.quantity;
    }

    updateData.totalPrice = calculatedTotalPrice;
    updateData.totalQuantity = calculatedTotalQuantity;
  }

  const updateQuery = { _id: id };
  if (updateData.status && updateData.status !== order.status) {
    updateQuery.status = order.status;
  }

  const updatedOrder = await Order.findOneAndUpdate(updateQuery, updateData, {
    new: true,
    runValidators: true,
  })
    .populate(
      "shopId",
      "username shopName phoneNumber address city governorate",
    )
    .populate(
      "traderId",
      "username shopName phoneNumber address city governorate",
    )
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType");

  if (!updatedOrder) {
    if (updateData.status && updateData.status !== order.status) {
      return next(new ApiError(StatusCodes.CONFLICT, "تم تحديث حالة الطلب بالفعل بواسطة طلب آخر"));
    }
    return next(
      new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to update order"),
    );
  }

  logger.info(`Order ${id} updated by user ${req.user.id}`);

  // Handle Delivered status: Auto stock-in and update sales
  if (updatedOrder.status === "delivered" && order.status !== "delivered") {
    const shopUserId = (updatedOrder.shopId?._id || updatedOrder.shopId)?.toString();
    const traderIdStr = (updatedOrder.traderId?._id || updatedOrder.traderId)?.toString();

    if (shopUserId && updatedOrder.products?.length) {
      const products = updatedOrder.products.map((p) => ({
        productId: (p.productId?._id || p.productId)?.toString(),
        quantity: p.quantity,
      }));

      autoStockInOnDelivery({ userId: shopUserId, products }).catch((err) => {
        logger.error(`[autoStockInOnDelivery] failed for order ${id} for reason : ${err.message}`);
      });

      // Update Shop totalSales
      await User.findByIdAndUpdate(shopUserId, {
        $inc: { totalSales: updatedOrder.totalPrice }
      });
    }

    // Update Trader totalSales
    if (traderIdStr) {
      await User.findByIdAndUpdate(traderIdStr, {
        $inc: { totalSales: updatedOrder.totalTraderPrice }
      });
    }

    // Increment every product of the order to its sold and totalSales
    if (updatedOrder.products?.length) {
      const productUpdates = updatedOrder.products.map((item) => {
        return Product.findByIdAndUpdate(item.productId, {
          $inc: {
            sold: item.quantity,
            totalSales: item.totalPrice,
          },
        });
      });
      await Promise.all(productUpdates);
    }
  }

  // Calculate personalized stats for the response
  const userRole = req.user.role;
  let stats;
  if (userRole === "admin") {
    stats = await getComprehensiveOrderStats();
  } else if (userRole === "trader") {
    stats = await getComprehensiveOrderStats({ traderId: new mongoose.Types.ObjectId(req.user.id) }, "$totalTraderPrice");
  } else {
    stats = await getComprehensiveOrderStats({ shopId: new mongoose.Types.ObjectId(req.user.id) });
  }

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      { order: updatedOrder, stats },
      "Order updated successfully",
    ),
  );
});

// ─── getOrder ────────────────────────────────────────────────────────────────
export const getOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findById(id)
    .populate(
      "shopId",
      "username shopName phoneNumber address city governorate",
    )
    .populate(
      "traderId",
      "username shopName phoneNumber address city governorate",
    )
    .populate("products.productId", "name price image description")
    .populate("coupon", "name discount discountType expiryDate")
    .populate("history.doneBy", "username shopName role");

  if (!order) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Order not found"));
  }

  // Check permissions - user can only see their own orders
  if (
    req.user.role !== "admin" &&
    order.shopId._id.toString() !== req.user.id &&
    order.traderId?._id?.toString() !== req.user.id
  ) {
    return next(
      new ApiError(StatusCodes.FORBIDDEN, "Not authorized to view this order"),
    );
  }

  const formattedOrder = order.toObject();
  formattedOrder.history = await order.getFormattedHistory();

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, formattedOrder, "Order fetched successfully"));
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

  // ── TraderProduct check & trader price calculation ───────────────────────────
  let totalTraderPrice = 0;
  const updatedProducts = [];

  for (const item of order.products) {
    const productId = (item.productId?._id || item.productId)?.toString();

    const traderProductRecord = await TraderProduct.findOne({
      traderId,
      productId,
    });

    if (!traderProductRecord) {
      // Trader doesn't have this product in their catalog
      const baseProduct = await Product.findById(productId);
      const productName = baseProduct?.name || productId;
      return next(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          `التاجر لا يمتلك هذا المنتج في مخزونه: ${productName}`,
        ),
      );
    }

    const traderPrice = traderProductRecord.price * item.quantity;
    totalTraderPrice += traderPrice;

    updatedProducts.push({ ...item.toObject(), traderPrice });
  }

  // Cancel any existing timeout job
  const prevTraderId = order.traderId?.toString();
  if (prevTraderId) {
    await cancelOrderCheck(orderId, prevTraderId);
  }

  // Update order with new trader and trader pricing
  const updatedOrder = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending" },
    { traderId, status: "pending", products: updatedProducts, totalTraderPrice },
    { new: true },
  )
    .populate(
      "shopId",
      "username shopName phoneNumber address city governorate",
    )
    .populate(
      "traderId",
      "username shopName phoneNumber address city governorate",
    )
    .populate("products.productId", "name price image")
    .populate("coupon", "name discount discountType");

  if (!updatedOrder) {
    return next(
      new ApiError(
        StatusCodes.CONFLICT,
        "تم تحديث حالة الطلب بالفعل بواسطة طلب آخر",
      ),
    );
  }

  // Schedule new timeout check
  await enqueueOrderCheck(orderId, traderId);

  logger.info(
    `Order ${orderId} forwarded to trader ${traderId} by user ${req.user.id} | totalTraderPrice: ${totalTraderPrice}`,
  );

  const formattedOrder = updatedOrder.toObject();
  formattedOrder.history = await updatedOrder.getFormattedHistory();

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        formattedOrder,
        "Order forwarded successfully",
      ),
    );
});

// ─── manualForwardOrder ──────────────────────────────────────────────────────
export const manualForwardOrder = (io, socket) => {
  socket.on("forwardOrder", async (orderId, traderId) => {
    try {


      const order = await Order.findById(orderId);
      if (!order) {
        return socket.emit("error", "الطلب غير موجود");
      }

      // ── TraderProduct check & trader price calculation ────────────────────
      let totalTraderPrice = 0;
      const updatedProducts = [];

      for (const item of order.products) {
        const productId = (item.productId?._id || item.productId)?.toString();

        const traderProductRecord = await TraderProduct.findOne({
          traderId,
          productId,
        });

        if (!traderProductRecord) {
          // Trader doesn't have this product — emit Arabic error
          const baseProduct = await Product.findById(productId);
          const productName = baseProduct?.name || productId;
          return socket.emit(
            "error",
            `التاجر لا يمتلك هذا المنتج في مخزونه: ${productName}`,
          );
        }

        const traderPrice = traderProductRecord.price * item.quantity;
        totalTraderPrice += traderPrice;

        updatedProducts.push({ ...item.toObject(), traderPrice });
      }

      // Cancel any existing timeout job for the previous trader
      const prevTraderId = (order.traderId?._id || order.traderId)?.toString();
      if (prevTraderId) {
        await cancelOrderCheck(orderId, prevTraderId);
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        {
          traderId,
          status: "pending",
          products: updatedProducts,
          totalTraderPrice,
          $push: { history: { phase: "reforward", doneBy: traderId } },
          takenAt: Date.now()
        },
        { new: true },
      );

      if (!updatedOrder) {
        return socket.emit("error", "فشل في تحديث الطلب");
      }

      const populatedOrder = await Order.findById(orderId)
        .populate(
          "shopId",
          "shopName phoneNumber address city governorate username",
        )
        .populate("traderId", "name phoneNumber username shopName")
        .populate("products.productId", "name price image");

      // Emit to admin + new trader
      const traderIdStr = traderId.toString();

      const formattedOrder = populatedOrder.toObject();
      formattedOrder.history = await populatedOrder.getFormattedHistory();

      io.to("admin").emit("newOrder", { order: formattedOrder });

      const socketId = onlineUsers.get(traderIdStr);
      if (socketId) {
        io.to(socketId).emit("sendOrder", { order: formattedOrder });
      }

      // Schedule a new timeout check for the newly assigned trader
      await enqueueOrderCheck(orderId, traderIdStr);

      logger.info(
        `Order ${orderId} manually forwarded to trader ${traderId} | totalTraderPrice: ${totalTraderPrice}`,
      );
    } catch (error) {
      logger.error("Error in manualForwardOrder:", error);
      socket.emit("error", "حدث خطأ أثناء إعادة توجيه الطلب");
    }
  });
};
