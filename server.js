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
import cookieParser from "cookie-parser";
import cors from "cors";
import { socketAuth } from "./src/middlewares/socketMiddleware.js";
import User from "./src/models/user.model.js";
import morgan from "morgan";
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
const server = app.listen(ENV.PORT);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    credentials: true,
  },
});
io.use(socketAuth);
io.on("connection", async (socket) => {
  const user = await User.findById(socket.user);
  console.log(user);
  if (user?.role === "admin") {
    socket.join("admin");
  } else {
    socket.to("admin").emit("userOnline", user);
  }

  socket.on("disconnect", async () => {
    const user = await User.findById(socket.user);
    if (user?.role === "admin") {
      socket.leave("admin");
    } else {
      socket.to("admin").emit("userOffline", user);
    }
  });
});
