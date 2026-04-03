import express from "express";
import { Server } from "socket.io";
import { ENV } from "./src/utils/ENV.js";
import { connectDB } from "./src/config/connectDB.js";
import { StatusCodes } from "http-status-codes";
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
import morgan from "morgan";
import {
  manualForwardOrder,
  sendOrder,
  updateOrderStatus,
} from "./src/controllers/order.controller.js";
import { createOrderForwardWorker } from "./src/utils/orderQueue.js";
import { sendNotification } from "./src/controllers/notification.controller.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
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
  console.log(`Server running on port ${ENV.PORT}`);
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

  // ✅ Silently remove old socket from the Map WITHOUT calling .disconnect()
  // Calling .disconnect() on old socket triggers frontend auto-reconnect = more duplicate connections
  const existingSocketId = onlineUsers.get(user.id);
  if (existingSocketId && existingSocketId !== socket.id) {
    const existingSocket = io.sockets.sockets.get(existingSocketId);
    if (existingSocket) {
      // ✅ Remove all listeners from old socket silently instead of disconnecting
      existingSocket.removeAllListeners();
    }
  }

  // ✅ Always overwrite with the latest socket
  onlineUsers.set(user.id, socket.id);

  // ✅ Join admin room
  if (user.role === "admin") {
    socket.join("admin");
  } else {
    socket.to("admin").emit("userOnline", user);
  }

  sendOrder(io, socket);
  manualForwardOrder(io, socket);
  updateOrderStatus(io, socket);
  sendNotification(io, socket);

  // ✅ Restore missing disconnect handler
  socket.on("disconnect", async () => {
    console.log(`❌ Disconnected: ${user.id} | socket: ${socket.id}`);

    // ✅ Only delete if it's still the same socket (prevent deleting new socket)
    if (onlineUsers.get(user.id) === socket.id) {
      onlineUsers.delete(user.id);
      if (user.role !== "admin") {
        socket.to("admin").emit("userOffline", user);
      }
    }
  });
});
