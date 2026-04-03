import { Schema, model } from "mongoose";

// ─────────────────────────────────────────────────────────────
// A single inventory record per product per user.
// source: "platform" → productId is set, customProduct is null
// source: "custom"   → customProduct is set, productId is null
// ─────────────────────────────────────────────────────────────
const inventorySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: [true, "User is required"],
      index: true,
    },

    // ── Source type ───────────────────────────────────────────
    source: {
      type: String,
      enum: ["platform", "custom"],
      required: [true, "Source is required"],
    },

    // ── Platform product reference ────────────────────────────
    // Set only when source === "platform"
    productId: {
      type: Schema.Types.ObjectId,
      ref: "product",
      default: null,
    },

    // ── Internal platform price snapshot ─────────────────────
    // Captured at creation time from the platform product.
    // select: false → NEVER sent to the retail user automatically.
    // Admin can opt-in by using .select("+platformPrice").
    platformPrice: {
      type: Number,
      default: null,
      select: false,
    },

    // ── User's own selling price (optional) ──────────────────
    // Retail user may set this freely for income / margin tracking.
    // Applies to both platform and custom products.
    userPrice: {
      type: Number,
      default: null,
      min: [0, "Price cannot be negative"],
    },

    // ── Client-created product ────────────────────────────────
    // Set only when source === "custom"
    customProduct: {
      name: {
        type: String,
        trim: true,
        minLength: [3, "Product name must be at least 3 characters long"],
        maxLength: [20, "Product name must be at most 20 characters long"],
      },
      description: {
        type: String,
        trim: true,
        minLength: [
          3,
          "Product description must be at least 3 characters long",
        ],
        maxLength: [
          50,
          "Product description must be at most 50 characters long",
        ],
      },
      image: {
        public_id: { type: String },
        url: { type: String },
      },
      category: {
        type: Schema.Types.ObjectId,
        ref: "category",
      },
      // Optional — user decides their own selling price
      price: {
        type: Number,
        min: [0, "Price cannot be negative"],
        default: null,
      },
    },

    // ── QR code — implement yourself ─────────────────────────
    qrCode: {
      public_id: { type: String, default: null },
      url: { type: String, default: null },
    },

    // ── Stock ─────────────────────────────────────────────────
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },

    lowStockThreshold: {
      type: Number,
      default: 10,
      min: [0, "Threshold cannot be negative"],
    },

    // Auto-updated by pre-save hook — do not set manually
    isLowStock: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// ── Indexes ───────────────────────────────────────────────────
// Prevent duplicate records for the same user + platform product
inventorySchema.index(
  { userId: 1, productId: 1 },
  { unique: true, sparse: true },
);

// ── Pre-save: sync isLowStock flag automatically ──────────────
inventorySchema.pre("save", function (next) {
  this.isLowStock = this.quantity <= this.lowStockThreshold;
  next();
});

// ── Pre-save: enforce exactly one source ──────────────────────
inventorySchema.pre("save", function (next) {
  const hasPlatform = !!this.productId;
  const hasCustom = this.customProduct && !!this.customProduct.name;

  if (this.source === "platform" && !hasPlatform)
    return next(new Error("Platform inventory must have a productId"));

  if (this.source === "custom" && !hasCustom)
    return next(new Error("Custom inventory must have a customProduct.name"));

  if (hasPlatform && hasCustom)
    return next(
      new Error(
        "An inventory record cannot link both a productId and a customProduct",
      ),
    );

  next();
});

const Inventory = model("inventory", inventorySchema);
export default Inventory;
