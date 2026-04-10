import express from "express";
import { Server } from "socket.io";
import { ENV } from "./src/utils/ENV.js";
import {connectDB} from "./src/config/connectDB.js"
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
import cookieParser from "cookie-parser";
import cors from "cors";
import { socketAuth } from "./src/middlewares/socketMiddleware.js";
import User from "./src/models/user.model.js";
import { createOrderForwardWorker } from "./src/utils/orderQueue.js";
import { sendNotification } from "./src/controllers/notification.controller.js";
import { securityMiddleware, authLimiter } from "./src/middlewares/security.js";
import { logger, stream } from "./src/utils/logger.js";
import morgan from "morgan";

const app = express();

// Apply security middleware first
app.use(securityMiddleware);

// Logging middleware
app.use(morgan('combined', { stream }));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: ENV.CORS_ORIGIN ? ENV.CORS_ORIGIN.split(',') : ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  }),
);

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: ENV.NODE_ENV,
    uptime: process.uptime()
  });
});

// Readiness check
app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await mongoose.connection.db.admin().ping();
    res.status(200).json({
      success: true,
      message: 'Service is ready',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Service not ready',
      database: 'disconnected'
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



const server = app.listen(ENV.PORT, () => {
  logger.info(`Server running on port ${ENV.PORT} in ${ENV.NODE_ENV} mode`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close database connection
      await mongoose.connection.close();
      logger.info('Database connection closed');

      // Close Redis connection if needed
      // await redisClient.quit();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  },
});

export const onlineUsers = new Map();

io.use(socketAuth);

io.on("connection", async (socket) => {
  const user = await User.findById(socket.user);

  // Start the BullMQ worker — pass your Socket.IO `io` instance
  const orderWorker = createOrderForwardWorker(io);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await orderWorker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await orderWorker.close();
    process.exit(0);
  });

  if (!user) {
    socket.disconnect();
    return;
  }

  console.log(`✅ Connected: ${user.id} | socket: ${socket.id}`);

  // Silently remove old socket from the Map WITHOUT calling .disconnect()
  // Calling .disconnect() on old socket triggers frontend auto-reconnect = more duplicate connections
  const existingSocketId = onlineUsers.get(user.id);
  if (existingSocketId && existingSocketId !== socket.id) {
    const existingSocket = io.sockets.sockets.get(existingSocketId);
    if (existingSocket) {
      //Remove all listeners from old socket silently instead of disconnecting
      existingSocket.removeAllListeners();
    }
  }

  //Always overwrite with the latest socket
  onlineUsers.set(user.id, socket.id);

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

  //Restore missing disconnect handler
  socket.on("disconnect", async () => {
    console.log(`❌ Disconnected: ${user.id} | socket: ${socket.id}`);

    // Only delete if it's still the same socket (prevent deleting new socket)
    if (onlineUsers.get(user.id) === socket.id) {
      onlineUsers.delete(user.id);
      if (user.role !== "admin") {
        socket.to("admin").emit("userOffline", user);
      }
    }
  });
});
