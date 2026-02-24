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
      required: [true, "Trader Id is required"],
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
    isPaid: {
      type: Boolean,
      default: false,
    },
    isAccepted: {
      type: Boolean,
      default: false,
    },
    isRejected: {
      type: Boolean,
      default: false,
    },
    isDelivered: {
      type: Boolean,
      default: false,
    },
    isPacked: {
      type: Boolean,
      default: false,
    },
    isCancelled: {
      type: Boolean,
      default: false,
    },
    isReturned: {
      type: Boolean,
      default: false,
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
      enum: ["Cash", "visa", "online"],
      required: [true, "Payment Method is required"],
    },
  },
  { timeStamps: true },
);

const Order = model("order", orderSchema);
export default Order;
