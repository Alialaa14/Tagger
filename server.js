import express from "express";
import { Server } from "socket.io";
import { ENV } from "./src/utils/ENV.js";
import { connectDB } from "./src/config/connectDB.js";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import userRouter from "./src/routers/user.router.js";
import categoryRouter from "./src/routers/category.router.js";
import productRouter from "./src/routers/product.router.js";
import cartRouter from "./src/routers/cart.router.js";
import couponRouter from "./src/routers/coupon.router.js";
import pagesRouter from "./src/routers/pages.router.js";
import orderRouter from "./src/routers/order.router.js";
import notificationRouter from "./src/routers/notification.router.js";
import reviewRouter from "./src/routers/review.router.js";
import traderProductRouter from "./src/routers/traderProduct.router.js";
import inventoryRouter from "./src/routers/inventory.router.js";
import bannerRouter from "./src/routers/banner.router.js";
import settingsRouter from "./src/routers/settings.router.js"
import companyRouter from "./src/routers/company.router.js";
import newsletterRouter from "./src/routers/newsletter.router.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import { socketAuth } from "./src/middlewares/socketMiddleware.js";
import User from "./src/models/user.model.js";
import { createOrderForwardWorker } from "./src/utils/orderQueue.js";
import redis, { checkIsMockMode } from "./src/utils/redis.js";
import { sendNotification } from "./src/controllers/notification.controller.js";
import { securityMiddleware, authLimiter } from "./src/middlewares/security.js";
import { logger, stream } from "./src/utils/logger.js";
import morgan from "morgan";
import {
  manualForwardOrder,
  sendOrder,
  updateOrderStatus,
} from "./src/controllers/order.controller.js";

const app = express();

const corsOrigin = (ENV.CORS_ORIGIN || "https://tagger-production.up.railway.app");


app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Apply security middleware first
app.use(securityMiddleware);

// Logging middleware
app.use(morgan("combined", { stream }));
app.use(morgan("dev"));

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api/v1/auth", userRouter);
app.use("/api/v1/category", categoryRouter);
app.use("/api/v1/product", productRouter);
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/coupon", couponRouter);
app.use("/api/v1/pages", pagesRouter);
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/notification", notificationRouter);
app.use("/api/v1/review", reviewRouter);
app.use("/api/v1/trader-products", traderProductRouter);
app.use("/api/v1/inventory", inventoryRouter);
app.use("/api/v1/banners", bannerRouter);
app.use("/api/v1/company", companyRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/newsletter", newsletterRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: ENV.NODE_ENV,
    uptime: process.uptime(),
  });
});

// Readiness check
app.get("/ready", async (req, res) => {
  try {
    // Check database connection
    await mongoose.connection.db.admin().ping();
    res.status(200).json({
      success: true,
      message: "Service is ready",
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "Service not ready",
      database: "disconnected",
    });
  }
});

app.use((req, res, next) => {
  return res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: "Route Not Found",
  });
});

app.use((error, req, res, next) => {
  return res
    .status(error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR)
    .json({
      success: false,
      message: error.message,
      errors: error.errors,
      stack: ENV.NODE_ENV === "development" ? error.stack : null,
    });
});

connectDB();
const server = app.listen(ENV.PORT, () => {
  logger.info(`Server running on port ${ENV.PORT} in ${ENV.NODE_ENV} mode`);
});

// Signal to handle worker closure
let orderWorker = null;

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info("HTTP server closed");

    try {
      // Close worker if exists
      if (orderWorker) {
        await orderWorker.close();
        logger.info("BullMQ worker closed");
      }

      // Close database connection
      await mongoose.connection.close();
      logger.info("Database connection closed");

      // Close Redis connection if needed
      if (redis && !checkIsMockMode()) {
        await redis.quit();
        logger.info("Redis connection closed");
      }

      logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skippedPackets: 5, // Skip up to 5 packets
  },
  pingInterval: 25000, // Send ping every 25 seconds
  pingTimeout: 60000, // If no pong received in 60 seconds, disconnect
  allowEIO3: true, // For compatibility with older clients
  transports: ["websocket", "polling"], // Enable both transports

});

export const onlineUsers = new Map();

io.use(socketAuth);

// Start the BullMQ worker ONCE — pass your Socket.IO `io` instance
orderWorker = createOrderForwardWorker(io);

io.on("connection", async (socket) => {
  const user = await User.findById(socket.user);

  if (!user) {
    socket.disconnect();
    return;
  }

  const userIdStr = user._id.toString();
  console.log(`✅ Connected: ${user.username} (${userIdStr}) | socket: ${socket.id}`);

  // Silently remove old socket from the Map WITHOUT calling .disconnect()
  const existingSocketId = onlineUsers.get(userIdStr);
  if (existingSocketId && existingSocketId !== socket.id) {
    const existingSocket = io.sockets.sockets.get(existingSocketId);
    if (existingSocket) {
      existingSocket.removeAllListeners();
    }
  }

  //Always overwrite with the latest socket
  onlineUsers.set(userIdStr, socket.id);

  //  Join admin room
  if (user.role === "admin") {
    socket.join("admin");
  } else {
    socket.to("admin").emit("userOnline", user);
  }

  sendOrder(io, socket);
  manualForwardOrder(io, socket);
  updateOrderStatus(io, socket);
  sendNotification(io, socket);

  socket.on("disconnect", async () => {
    console.log(`❌ Disconnected: ${user.username} (${userIdStr}) | socket: ${socket.id}`);

    // Only delete if it's still the same socket
    if (onlineUsers.get(userIdStr) === socket.id) {
      onlineUsers.delete(userIdStr);
      if (user.role !== "admin") {
        socket.to("admin").emit("userOffline", user);
      }
    }
  });
});
