import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import Category from "../models/category.model.js";
import Product from "../models/product.model.js";
export const getHome = asyncHandler(async (req, res, next) => {
  const categories = await Category.find({}).limit(5);
  const products = await Product.find({}).limit(5);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { categories, products },
        "Home Page Fetched Successfully",
      ),
    );
});
