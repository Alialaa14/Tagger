import { Schema, model } from "mongoose";

const orderSchema = new Schema(
  {
    shopId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: [true, "Shop Id is required"],
    },
    traderId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    products: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "product",
          required: [true, "Product Id is required"],
        },
        quantity: {
          type: Number,
          required: [true, "Quantity is required"],
        },
        totalPrice: {
          type: Number,
          required: [true, "Total Price is required"],
        },
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "delivered",
        "cancelled",
        "accepted",
        "rejected",
        "shipped",
      ],
      default: "pending",
    },
    totalPrice: {
      type: Number,
      required: [true, "Total Price is required"],
    },
    totalQuantity: {
      type: Number,
      required: [true, "Total Quantity is required"],
    },
    note: {
      type: String,
    },
    address: {
      type: String,
      minLength: [3, "Address must be at least 3 characters long"],
      maxLength: [50, "Address must be at most 50 characters long"],
      trim: true,
    },
    paymentMethod: {
      type: String,
      default: "Cash",
    },
    coupon: {
      type: Schema.Types.ObjectId,
      ref: "coupon",
      default: null,
    },
  },
  { timestamps: true },
);

const Order = model("order", orderSchema);
export default Order;
