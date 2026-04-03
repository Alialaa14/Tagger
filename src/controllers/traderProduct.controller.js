import Product from "../models/product.model.js";
import TraderProduct from "../models/traderProduct.js";
import User from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

// ─────────────────────────────────────────────────────────────
// Shared populate config — keeps every query consistent
// ─────────────────────────────────────────────────────────────
const POPULATE_OPTIONS = [
  {
    path: "productId",
    select: "name description image price discount category",
    populate: { path: "category", select: "name" },
  },
  {
    path: "traderId",
    select: "username shopName city governorate logo rank",
  },
];

// ─────────────────────────────────────────────────────────────
// @desc    Get all platform products (so the trader can pick)
// @route   GET /api/trader-products/catalog
// @access  Trader
// ─────────────────────────────────────────────────────────────
export const getCatalog = asyncHandler(async (req, res) => {
  const { limit = 10, page = 1, search = "" } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = search ? { name: { $regex: search, $options: "i" } } : {};

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name")
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Product.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      },
      "Catalog fetched successfully",
    ),
  );
});

// ─────────────────────────────────────────────────────────────
// @desc    Trader adds a platform product with his own price
//          → increments trader rank by 1
// @route   POST /api/trader-products/my
// @access  Trader
// ─────────────────────────────────────────────────────────────
export const createTraderProduct = asyncHandler(async (req, res, next) => {
  const traderId = req.user.id;
  const { productId, price, quantity } = req.body;

  if (!productId) return next(new ApiError(400, "productId is required"));
  if (!price) return next(new ApiError(400, "price is required"));

  // Confirm the platform product exists
  const platformProduct = await Product.findById(productId);
  if (!platformProduct)
    return next(new ApiError(404, "Product not found in catalog"));

  // Trader price must not exceed platform price
  if (price > platformProduct.price)
    return next(
      new ApiError(
        400,
        `Your price cannot exceed the platform price of ${platformProduct.price}`,
      ),
    );

  // Prevent duplicate listings
  const existing = await TraderProduct.findOne({ productId, traderId });
  if (existing)
    return next(
      new ApiError(409, "You already listed this product — update it instead"),
    );

  // Create the listing and increment the trader's rank in parallel
  const [traderProduct] = await Promise.all([
    TraderProduct.create({
      productId,
      traderId,
      price,
      ...(quantity !== undefined && { quantity }),
    }),
    User.findByIdAndUpdate(traderId, { $inc: { rank: 0.2 } }),
  ]);

  const populated = await traderProduct.populate(POPULATE_OPTIONS);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { product: populated },
        "Product listed successfully",
      ),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Get all products listed by the logged-in trader
// @route   GET /api/trader-products/my
// @access  Trader
// ─────────────────────────────────────────────────────────────
export const getMyTraderProducts = asyncHandler(async (req, res) => {
  const traderId = req.user.id;
  const { limit = 10, page = 1 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [products, total] = await Promise.all([
    TraderProduct.find({ traderId })
      .populate(POPULATE_OPTIONS)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    TraderProduct.countDocuments({ traderId }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      },
      "Your listed products fetched successfully",
    ),
  );
});

// ─────────────────────────────────────────────────────────────
// @desc    Get a single trader-product by its _id
// @route   GET /api/trader-products/:id
// @access  Trader / Admin
// ─────────────────────────────────────────────────────────────
export const getTraderProductById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const product = await TraderProduct.findById(id)
    .populate(POPULATE_OPTIONS)
    .lean();

  if (!product) return next(new ApiError(404, "Trader product not found"));

  return res
    .status(200)
    .json(
      new ApiResponse(200, { product }, "Trader product fetched successfully"),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Get all listed products for a specific trader (public / admin)
// @route   GET /api/trader-products/trader/:traderId
// @access  Trader / Admin
// ─────────────────────────────────────────────────────────────
export const getProductsByTrader = asyncHandler(async (req, res, next) => {
  const { traderId } = req.params;
  const { limit = 10, page = 1 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [products, total] = await Promise.all([
    TraderProduct.find({ traderId })
      .populate(POPULATE_OPTIONS)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    TraderProduct.countDocuments({ traderId }),
  ]);

  if (!products.length)
    return next(new ApiError(404, "No products found for this trader"));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      },
      "Trader products fetched successfully",
    ),
  );
});

// ─────────────────────────────────────────────────────────────
// @desc    Update price and/or quantity of a listed product
// @route   PATCH /api/trader-products/:id
// @access  Trader (owner only)
// ─────────────────────────────────────────────────────────────
export const updateTraderProduct = asyncHandler(async (req, res, next) => {
  const traderId = req.user.id;
  const { id } = req.params;
  const { price, quantity } = req.body;

  if (price === undefined && quantity === undefined)
    return next(
      new ApiError(400, "Provide at least price or quantity to update"),
    );

  const traderProduct = await TraderProduct.findById(id);
  if (!traderProduct)
    return next(new ApiError(404, "Trader product not found"));

  // Ownership guard
  if (traderProduct.traderId.toString() !== traderId)
    return next(
      new ApiError(403, "You are not allowed to update this product"),
    );

  if (price !== undefined) {
    const platformProduct = await Product.findById(traderProduct.productId);
    if (price > platformProduct.price)
      return next(
        new ApiError(
          400,
          `Your price cannot exceed the platform price of ${platformProduct.price}`,
        ),
      );
    traderProduct.price = price;
  }

  if (quantity !== undefined) traderProduct.quantity = quantity;

  await traderProduct.save();

  const populated = await traderProduct.populate(POPULATE_OPTIONS);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { product: populated },
        "Product updated successfully",
      ),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Remove a listed product
//          → decrements trader rank by 1 (floor at 0)
// @route   DELETE /api/trader-products/:id
// @access  Trader (owner) / Admin
// ─────────────────────────────────────────────────────────────
export const deleteTraderProduct = asyncHandler(async (req, res, next) => {
  const traderId = req.user.id;
  const { id } = req.params;

  const traderProduct = await TraderProduct.findById(id);
  if (!traderProduct)
    return next(new ApiError(404, "Trader product not found"));

  // Admin can delete any listing; trader can only delete their own
  const user = await User.findById(traderId);
  const isAdmin = user.role === "admin";
  const ownerId = traderProduct.traderId.toString();

  if (!isAdmin && ownerId !== traderId)
    return next(
      new ApiError(403, "You are not allowed to delete this product"),
    );

  // Delete listing and decrement rank in parallel
  // $max ensures rank never goes below 0
  await Promise.all([
    traderProduct.deleteOne(),
    User.findByIdAndUpdate(ownerId, { $inc: { rank: -0.2 } }),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Product removed successfully"));
});

// ─────────────────────────────────────────────────────────────
// @desc    Resolve a listing by platformProductId + traderId
//          Used when creating an order to link both sides
// @route   GET /api/trader-products/link?productId=&traderId=
// @access  Trader / Admin
// ─────────────────────────────────────────────────────────────
export const getLinkedTraderProduct = asyncHandler(async (req, res, next) => {
  const { productId, traderId } = req.query;

  if (!productId || !traderId)
    return next(new ApiError(400, "Both productId and traderId are required"));

  const traderProduct = await TraderProduct.findOne({ productId, traderId })
    .populate(POPULATE_OPTIONS)
    .lean();

  if (!traderProduct)
    return next(
      new ApiError(
        404,
        "No listing found for this product and trader combination",
      ),
    );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { product: traderProduct },
        "Linked product fetched successfully",
      ),
    );
});
