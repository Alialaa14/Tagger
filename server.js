import express from "express";
import { ENV } from "./src/utils/ENV.js";
import { connectDB } from "./src/config/connectDB.js";
import { StatusCodes } from "http-status-codes";
import userRouter from "./src/routers/user.router.js";
import categoryRouter from "./src/routers/category.router.js";
import productRouter from "./src/routers/product.router.js";
import cookieParser from "cookie-parser";
const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", userRouter);
app.use("/api/v1/category", categoryRouter);
app.use("/api/v1/product", productRouter);

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
app.listen(ENV.PORT, () => {
  console.log(`Server is running on port ${ENV.PORT}`);
});
