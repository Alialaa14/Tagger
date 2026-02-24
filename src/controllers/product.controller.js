import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import { StatusCodes } from "http-status-codes";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

//@Desc Create Product
//@router POST /api/v1/product
//@Access Private

export const createProduct = asyncHandler(async (req, res, next) => {
  const { name, description, category, price } = req.body;

  const product = await Product.findOne({ name });
  if (product)
    return next(new ApiError(StatusCodes.CONFLICT, "Product Already Exists"));

  const categoryExists = await Category.findById(category);
  if (!categoryExists) return next(new ApiError(StatusCodes.NOT_FOUND));
  // upload to cloudinary
  let imageUpload = {};
  if (req?.file?.path) {
    const result = await uploadToCloudinary(req.file.path, "Tagger/products");
    imageUpload = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  const newProduct = await Product.create({
    name,
    description,
    category,
    price,
    image: imageUpload,
  });

  if (!newProduct)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Product Not Created"));
  return res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        newProduct,
        "Product Created Successfully",
      ),
    );
});

//@Desc Edit Product
//@router PATCH /api/v1/product/:id
//@Access Private

export const updateProduct = asyncHandler(async (req, res, next) => {
  const { name, description, category, price } = req.body;
  const productId = req.params.id;

  if (category) {
    const categoryExists = await Category.findById(category);

    if (!categoryExists)
      return next(new ApiError(StatusCodes.NOT_FOUND, "Category Not Found"));
  }
  const product = await Product.findById(productId);
  if (!product) return next(new ApiError(StatusCodes.NOT_FOUND));

  // upload to cloudinary
  let imageUpload = {};
  if (req?.file?.path) {
    // Delete old Image from Cloudinary
    if (product.image?.public_id) {
      await deleteFromCloudinary(product.image.public_id, "image");
    }
    const result = await uploadToCloudinary(req.file.path, "Tagger/products");
    imageUpload = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  const updatedProduct = await Product.findByIdAndUpdate(
    productId,
    {
      name: name || product.name,
      description: description || product.description,
      category: category || product.category,
      price: price || product.price,
      image: imageUpload || product.image,
    },
    { new: true },
  );

  if (!updatedProduct)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Product Not Updated"));
  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        updatedProduct,
        "Product Updated Successfully",
      ),
    );
});

//@Desc delete Product
//@router DELETE /api/v1/product/:id
//@Access Private

export const deleteProduct = asyncHandler(async (req, res, next) => {
  const productId = req.params.id;

  const product = await Product.findById(productId);

  if (!product)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

  // Delete Image from Cloudinary
  if (product.image?.public_id) {
    await deleteFromCloudinary(product.image.public_id, "image");
  }
  const deletedProduct = await Product.findByIdAndDelete(productId);
  if (!deletedProduct)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Product Not Deleted"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, deletedProduct, "Product Deleted"));
});

//@Desc Get All Products
//@router GET /api/v1/product
//@Access Public
export const getAllProducts = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    sortBy = "name",
    sortOrder = "asc",
  } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let query = {};
  if (search) {
    query.$or = [
      {
        name: { $regex: search, $options: "i" },
        description: { $regex: search, $options: "i" },
      },
    ];
  }
  if (category) {
    query.category = category;
  }
  const products = await Product.find(query)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(Number(limit));
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, products, "Products Fetched"));
});

//@Desc Get Product By Id
//@router GET /api/v1/product/:id
//@Access Public

export const getProduct = asyncHandler(async (req, res, next) => {
  const productId = req.params.id;
  const product = await Product.findById(productId).populate(
    "category",
    "name",
  );
  if (!product)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, product, "Product Fetched"));
});
