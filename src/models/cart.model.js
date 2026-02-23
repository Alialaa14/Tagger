import { Schema, model } from "mongoose";

const cartSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: [true, "Owner is required"],
    },
    products: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "product",
          required: [true, "Product is required"],
        },
        quantity: {
          type: Number,
          default: 1,
        },
      },
    ],
    totalPrice: {
      type: Number,
      default: 0,
    },
    totalQuantity: {
      type: Number,
      default: 0,
    },
    note: {
      type: String,
      trim: true,
    },
    coupon: {
      type: Schema.Types.ObjectId,
      ref: "coupon",
    },
  },
  { timeStamps: true },
);

const Cart = model("cart", cartSchema);
export default Cart;
