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

// ─────────────────────────────────────────────────────────────
// @Desc    Create Product
// @Route   POST /api/products
// @Access  Private — admin only
// ─────────────────────────────────────────────────────────────
export const createProduct = asyncHandler(async (req, res, next) => {
  const { name, description, category, price } = req.body;

  const existing = await Product.findOne({ name });
  if (existing)
    return next(new ApiError(StatusCodes.CONFLICT, "Product Already Exists"));

  const categoryExists = await Category.findById(category);
  if (!categoryExists)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Category Not Found"));

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

// ─────────────────────────────────────────────────────────────
// @Desc    Update Product
// @Route   PATCH /api/products/:id
// @Access  Private — admin only
// ─────────────────────────────────────────────────────────────
export const updateProduct = asyncHandler(async (req, res, next) => {
  const { name, description, category, price } = req.body;
  const productId = req.params.id;

  if (category) {
    const categoryExists = await Category.findById(category);
    if (!categoryExists)
      return next(new ApiError(StatusCodes.NOT_FOUND, "Category Not Found"));
  }

  const product = await Product.findById(productId);
  if (!product)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

  let imageUpload = null;
  if (req?.file?.path) {
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

// ─────────────────────────────────────────────────────────────
// @Desc    Delete Product
// @Route   DELETE /api/products/:id
// @Access  Private — admin only
// ─────────────────────────────────────────────────────────────
export const deleteProduct = asyncHandler(async (req, res, next) => {
  const productId = req.params.id;

  const product = await Product.findById(productId);
  if (!product)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

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

// ─────────────────────────────────────────────────────────────
// @Desc    Get All Products  (shared catalog for all roles)
//
//          Traders  → browse to create a TraderProduct listing
//          Users    → browse to add a platform Inventory record
//          Public   → general product browsing
//
// @Route   GET /api/products
// @Route   GET /api/products/catalog   (authenticated alias)
// @Access  Public (getAllProducts) | Authenticated (getCatalog)
//
// Query params:
//   page, limit, search, minPrice, maxPrice, category, sortBy, sortOrder
// ─────────────────────────────────────────────────────────────
export const getAllProducts = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    minPrice,
    maxPrice,
    category,
    sortBy = "name",
    sortOrder = "asc",
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const query = {};

  // ── Search across name OR description ─────────────────────
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // ── Category filter ───────────────────────────────────────
  if (category) {
    query.category = category;
  }

  // ── Price range filter ────────────────────────────────────
  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {};
    if (minPrice !== undefined) query.price.$gte = Number(minPrice);
    if (maxPrice !== undefined) query.price.$lte = Number(maxPrice);
  }

  const [products, total] = await Promise.all([
    Product.find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("category", "name"),
    Product.countDocuments(query),
  ]);

  if (!products || products.length === 0)
    return next(new ApiError(StatusCodes.NOT_FOUND, "No Products Found"));

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        products,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      "Products Fetched",
    ),
  );
});

// ─────────────────────────────────────────────────────────────
// @Desc    Get Single Product
// @Route   GET /api/products/:id
// @Access  Public
// ─────────────────────────────────────────────────────────────
export const getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id).populate(
    "category",
    "name",
  );
  if (!product)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, product, "Product Fetched"));
});
