import { Schema, model } from "mongoose";

// ─────────────────────────────────────────────────────────────
// Immutable audit log — never updated or deleted.
// Every stock movement writes one entry here.
// ─────────────────────────────────────────────────────────────
const inventoryLogSchema = new Schema(
  {
    inventoryId: {
      type: Schema.Types.ObjectId,
      ref: "inventory",
      required: [true, "Inventory record is required"],
      index: true,
    },

    // Who performed the movement (user or admin)
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: [true, "Performer is required"],
    },

    // ── Movement type ─────────────────────────────────────────
    type: {
      type: String,
      enum: ["stock_in", "stock_out", "adjustment"],
      required: [true, "Movement type is required"],
    },

    // Positive for stock_in, negative for stock_out,
    // positive or negative for adjustment (delta from previous value)
    quantityChanged: {
      type: Number,
      required: [true, "Quantity changed is required"],
    },

    // Snapshot before and after — full audit trail at any point
    quantityBefore: {
      type: Number,
      required: [true, "Quantity before is required"],
    },
    quantityAfter: {
      type: Number,
      required: [true, "Quantity after is required"],
    },

    // Optional operator note e.g. "Damaged goods", "Customer return"
    note: {
      type: String,
      trim: true,
      maxLength: [200, "Note must be at most 200 characters"],
      default: "",
    },
  },
  { timestamps: true },
);

// Fast per-inventory log queries sorted by newest first
inventoryLogSchema.index({ inventoryId: 1, createdAt: -1 });

const InventoryLog = model("inventoryLog", inventoryLogSchema);
export default InventoryLog;
