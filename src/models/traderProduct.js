import { Schema, model } from "mongoose";

const traderProductSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "product",
      required: [true, "Product is required"],
    },
    traderId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: [true, "User is required"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
    },
    sold: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

const TraderProduct = model("traderProduct", traderProductSchema);
export default TraderProduct;
