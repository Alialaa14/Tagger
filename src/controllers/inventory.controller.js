import Inventory from "../models/inventory.model.js";
import InventoryLog from "../models/inventoryLog.model.js";
import Product from "../models/product.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Populate config for platform products — price excluded for retail user
const PLATFORM_POPULATE = {
  path: "productId",
  select: "name description image category", // ← no "price"
  populate: { path: "category", select: "name" },
};

// Admin gets price too
const PLATFORM_POPULATE_ADMIN = {
  path: "productId",
  select: "name description image category price",
  populate: { path: "category", select: "name" },
};

const CUSTOM_CATEGORY_POPULATE = {
  path: "customProduct.category",
  select: "name",
};

/**
 * Write a stock movement log entry.
 * Centralised so every handler stays DRY.
 */
const writeLog = async ({
  inventoryId,
  performedBy,
  type,
  quantityBefore,
  quantityAfter,
  note = "",
}) => {
  await InventoryLog.create({
    inventoryId,
    performedBy,
    type,
    quantityChanged: quantityAfter - quantityBefore,
    quantityBefore,
    quantityAfter,
    note,
  });
};

// ─────────────────────────────────────────────────────────────
// @desc    Add a platform product to the user's inventory
// @route   POST /api/inventory/platform
// @access  user
// Body:    { productId, userPrice? (optional), quantity?, lowStockThreshold? }
// ─────────────────────────────────────────────────────────────
export const createPlatformInventory = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { productId, userPrice, quantity = 0, lowStockThreshold } = req.body;

  if (!productId) return next(new ApiError(400, "productId is required"));

  // Confirm the platform product exists and grab its price for internal snapshot
  const platformProduct = await Product.findById(productId).select("+price");
  if (!platformProduct)
    return next(new ApiError(404, "Product not found in catalog"));

  // Prevent duplicates
  const existing = await Inventory.findOne({ userId, productId });
  if (existing)
    return next(new ApiError(409, "This product is already in your inventory"));

  const inventoryData = {
    userId,
    source: "platform",
    productId,
    platformPrice: platformProduct.price, // stored internally, never returned to user
    quantity,
    ...(userPrice !== undefined && { userPrice }),
    ...(lowStockThreshold !== undefined && { lowStockThreshold }),
  };

  const inventory = await Inventory.create(inventoryData);

  // Write initial stock log if quantity > 0
  if (quantity > 0) {
    await writeLog({
      inventoryId: inventory._id,
      performedBy: userId,
      type: "stock_in",
      quantityBefore: 0,
      quantityAfter: quantity,
      note: "Initial stock on inventory creation",
    });
  }

  const populated = await Inventory.findById(inventory._id)
    .populate(PLATFORM_POPULATE)
    .populate(CUSTOM_CATEGORY_POPULATE);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { inventory: populated },
        "Product added to inventory",
      ),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Add a custom (non-platform) product to inventory
// @route   POST /api/inventory/custom
// @access  user
// Body:    { name, description, category?, userPrice?, quantity?, lowStockThreshold? }
// File:    image (optional)
// ─────────────────────────────────────────────────────────────
export const createCustomInventory = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    name,
    description,
    category,
    userPrice,
    quantity = 0,
    lowStockThreshold,
  } = req.body;

  if (!name) return next(new ApiError(400, "Product name is required"));

  // Handle optional image upload
  let image = {};
  if (req.file) {
    const uploaded = await uploadToCloudinary(
      req.file.path,
      "Tagger/inventory",
    );
    if (!uploaded) return next(new ApiError(500, "Image upload failed"));
    image = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }

  const inventoryData = {
    userId,
    source: "custom",
    customProduct: {
      name,
      ...(description && { description }),
      ...(category && { category }),
      ...(Object.keys(image).length && { image }),
      ...(userPrice !== undefined && { price: userPrice }),
    },
    quantity,
    ...(userPrice !== undefined && { userPrice }),
    ...(lowStockThreshold !== undefined && { lowStockThreshold }),
  };

  const inventory = await Inventory.create(inventoryData);

  if (quantity > 0) {
    await writeLog({
      inventoryId: inventory._id,
      performedBy: userId,
      type: "stock_in",
      quantityBefore: 0,
      quantityAfter: quantity,
      note: "Initial stock on inventory creation",
    });
  }

  const populated = await Inventory.findById(inventory._id).populate(
    CUSTOM_CATEGORY_POPULATE,
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { inventory: populated },
        "Custom product added to inventory",
      ),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Get logged-in user's own inventory
// @route   GET /api/inventory/my?source=platform|custom&lowStock=true&page=1&limit=10
// @access  user
// ─────────────────────────────────────────────────────────────
export const getMyInventory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { source, lowStock, page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { userId, isActive: true };
  if (source) filter.source = source;
  if (lowStock === "true") filter.isLowStock = true;

  const [items, total] = await Promise.all([
    Inventory.find(filter)
      .populate(PLATFORM_POPULATE) // price excluded for retail user
      .populate(CUSTOM_CATEGORY_POPULATE)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Inventory.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        inventory: items,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      },
      "Inventory fetched successfully",
    ),
  );
});

// ─────────────────────────────────────────────────────────────
// @desc    Get a single inventory record by id
// @route   GET /api/inventory/:id
// @access  user (own) | admin (any)
// ─────────────────────────────────────────────────────────────
export const getInventoryById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const requesterId = req.user.id;
  const isAdmin = req.user.role === "admin";

  const inventory = await Inventory.findById(id)
    .select(isAdmin ? "+platformPrice" : "") // admin sees platformPrice
    .populate(isAdmin ? PLATFORM_POPULATE_ADMIN : PLATFORM_POPULATE)
    .populate(CUSTOM_CATEGORY_POPULATE)
    .lean();

  if (!inventory) return next(new ApiError(404, "Inventory record not found"));

  // Retail user can only see their own records
  if (!isAdmin && inventory.userId.toString() !== requesterId)
    return next(new ApiError(403, "Access denied"));

  return res
    .status(200)
    .json(new ApiResponse(200, { inventory }, "Inventory record fetched"));
});

// ─────────────────────────────────────────────────────────────
// @desc    Admin: get all inventory records for a specific user
// @route   GET /api/inventory/user/:userId
// @access  admin
// ─────────────────────────────────────────────────────────────
export const getInventoryByUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { source, lowStock, page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { userId };
  if (source) filter.source = source;
  if (lowStock === "true") filter.isLowStock = true;

  const [items, total] = await Promise.all([
    Inventory.find(filter)
      .select("+platformPrice") // admin sees platformPrice
      .populate(PLATFORM_POPULATE_ADMIN) // admin sees product price too
      .populate(CUSTOM_CATEGORY_POPULATE)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Inventory.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        inventory: items,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      },
      "User inventory fetched successfully",
    ),
  );
});

// ─────────────────────────────────────────────────────────────
// @desc    Update inventory record (userPrice, lowStockThreshold, custom fields)
// @route   PATCH /api/inventory/:id
// @access  user (own only)
// ─────────────────────────────────────────────────────────────
export const updateInventory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { userPrice, lowStockThreshold, name, description, category } =
    req.body;

  const inventory = await Inventory.findById(id);
  if (!inventory) return next(new ApiError(404, "Inventory record not found"));
  if (inventory.userId.toString() !== userId)
    return next(new ApiError(403, "Access denied"));

  // ── Fields allowed for both sources ──────────────────────────
  if (userPrice !== undefined) inventory.userPrice = userPrice;
  if (lowStockThreshold !== undefined)
    inventory.lowStockThreshold = lowStockThreshold;

  // ── Fields allowed for custom products only ───────────────────
  if (inventory.source === "custom") {
    if (name) inventory.customProduct.name = name;
    if (description) inventory.customProduct.description = description;
    if (category) inventory.customProduct.category = category;
    if (userPrice !== undefined) inventory.customProduct.price = userPrice;

    // Handle optional image replacement
    if (req.file) {
      // Delete old image if exists
      if (inventory.customProduct.image?.public_id) {
        await deleteFromCloudinary(inventory.customProduct.image.public_id);
      }
      const uploaded = await uploadToCloudinary(req.file.path);
      if (!uploaded) return next(new ApiError(500, "Image upload failed"));
      inventory.customProduct.image = {
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      };
    }
  }

  await inventory.save();

  const populated = await Inventory.findById(inventory._id)
    .populate(PLATFORM_POPULATE)
    .populate(CUSTOM_CATEGORY_POPULATE);

  return res
    .status(200)
    .json(new ApiResponse(200, { inventory: populated }, "Inventory updated"));
});

// ─────────────────────────────────────────────────────────────
// @desc    Delete an inventory record
// @route   DELETE /api/inventory/:id
// @access  user (own) | admin (any)
// ─────────────────────────────────────────────────────────────
export const deleteInventory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const requesterId = req.user.id;
  const isAdmin = req.user.role === "admin";

  const inventory = await Inventory.findById(id);
  if (!inventory) return next(new ApiError(404, "Inventory record not found"));

  if (!isAdmin && inventory.userId.toString() !== requesterId)
    return next(new ApiError(403, "Access denied"));

  // Clean up custom product image from Cloudinary
  if (
    inventory.source === "custom" &&
    inventory.customProduct?.image?.public_id
  ) {
    await deleteFromCloudinary(inventory.customProduct.image.public_id);
  }

  await inventory.deleteOne();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Inventory record deleted"));
});

// ─────────────────────────────────────────────────────────────
// @desc    Stock in — increase quantity
// @route   POST /api/inventory/:id/stock-in
// @access  user (own only)
// Body:    { quantity, note? }
// ─────────────────────────────────────────────────────────────
export const stockIn = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { quantity, note } = req.body;

  if (!quantity || quantity <= 0)
    return next(new ApiError(400, "quantity must be a positive number"));

  const inventory = await Inventory.findById(id);
  if (!inventory) return next(new ApiError(404, "Inventory record not found"));
  if (inventory.userId.toString() !== userId)
    return next(new ApiError(403, "Access denied"));

  const quantityBefore = inventory.quantity;
  inventory.quantity += quantity;
  await inventory.save();

  await writeLog({
    inventoryId: id,
    performedBy: userId,
    type: "stock_in",
    quantityBefore,
    quantityAfter: inventory.quantity,
    note,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { quantity: inventory.quantity }, "Stock added"),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Stock out — decrease quantity
// @route   POST /api/inventory/:id/stock-out
// @access  user (own only)
// Body:    { quantity, note? }
// ─────────────────────────────────────────────────────────────
export const stockOut = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { quantity, note } = req.body;

  if (!quantity || quantity <= 0)
    return next(new ApiError(400, "quantity must be a positive number"));

  const inventory = await Inventory.findById(id);
  if (!inventory) return next(new ApiError(404, "Inventory record not found"));
  if (inventory.userId.toString() !== userId)
    return next(new ApiError(403, "Access denied"));

  if (inventory.quantity < quantity)
    return next(
      new ApiError(400, `Insufficient stock. Available: ${inventory.quantity}`),
    );

  const quantityBefore = inventory.quantity;
  inventory.quantity -= quantity;
  await inventory.save();

  await writeLog({
    inventoryId: id,
    performedBy: userId,
    type: "stock_out",
    quantityBefore,
    quantityAfter: inventory.quantity,
    note,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { quantity: inventory.quantity }, "Stock removed"),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Adjust stock — set an absolute quantity
// @route   POST /api/inventory/:id/adjust
// @access  user | admin
// Body:    { quantity, note? }
// ─────────────────────────────────────────────────────────────
export const adjustStock = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const requesterId = req.user.id;
  const isAdmin = req.user.role === "admin";
  const { quantity, note } = req.body;

  if (quantity === undefined || quantity < 0)
    return next(new ApiError(400, "quantity must be a non-negative number"));

  const inventory = await Inventory.findById(id);
  if (!inventory) return next(new ApiError(404, "Inventory record not found"));

  if (!isAdmin && inventory.userId.toString() !== requesterId)
    return next(new ApiError(403, "Access denied"));

  const quantityBefore = inventory.quantity;
  inventory.quantity = quantity;
  await inventory.save();

  await writeLog({
    inventoryId: id,
    performedBy: requesterId,
    type: "adjustment",
    quantityBefore,
    quantityAfter: quantity,
    note,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { quantity: inventory.quantity }, "Stock adjusted"),
    );
});

// ─────────────────────────────────────────────────────────────
// @desc    Get movement logs for an inventory record
// @route   GET /api/inventory/:id/logs?type=stock_in|stock_out|adjustment&page=1&limit=20
// @access  user (own) | admin (any)
// ─────────────────────────────────────────────────────────────
export const getInventoryLogs = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const requesterId = req.user.id;
  const isAdmin = req.user.role === "admin";
  const { type, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Verify the inventory record exists and the user owns it
  const inventory = await Inventory.findById(id).lean();
  if (!inventory) return next(new ApiError(404, "Inventory record not found"));
  if (!isAdmin && inventory.userId.toString() !== requesterId)
    return next(new ApiError(403, "Access denied"));

  const filter = { inventoryId: id };
  if (type) filter.type = type;

  const [logs, total] = await Promise.all([
    InventoryLog.find(filter)
      .populate("performedBy", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    InventoryLog.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        logs,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      },
      "Logs fetched successfully",
    ),
  );
});

// ─────────────────────────────────────────────────────────────
// @desc    Auto stock-in when a platform order is delivered
//          Call this from updateOrderStatus when status === "delivered"
//
// What it does for each product in the order:
//   1. Find the inventory record for this user + productId
//   2. If found → stock_in the ordered quantity + write log
//   3. If not found → create a new inventory record automatically
//
// @param   { userId, products: [{ productId, quantity }] }
// ─────────────────────────────────────────────────────────────
export const autoStockInOnDelivery = async ({ userId, products }) => {
  for (const item of products) {
    const { productId, quantity } = item;

    let inventory = await Inventory.findOne({ userId, productId });

    if (inventory) {
      // ── Record exists — just add the quantity ─────────────
      const quantityBefore = inventory.quantity;
      inventory.quantity += quantity;
      await inventory.save();

      await writeLog({
        inventoryId: inventory._id,
        performedBy: userId,
        type: "stock_in",
        quantityBefore,
        quantityAfter: inventory.quantity,
        note: "Auto stock-in from delivered order",
      });
    } else {
      // ── No record yet — create one automatically ──────────
      const platformProduct =
        await Product.findById(productId).select("+price");

      const newInventory = await Inventory.create({
        userId,
        source: "platform",
        productId,
        platformPrice: platformProduct?.price ?? null,
        quantity,
      });

      await writeLog({
        inventoryId: newInventory._id,
        performedBy: userId,
        type: "stock_in",
        quantityBefore: 0,
        quantityAfter: quantity,
        note: "Auto-created inventory from delivered order",
      });
    }
  }
};
