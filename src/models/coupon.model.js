import { Schema, model } from "mongoose";

const couponSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    discount: {
      type: Number,
      required: [true, "Discount is required"],
    },
    expiry: {
      type: Date,
      required: [true, "Expiry is required"],
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  { timeStamps: true },
);

const Coupon = model("coupon", couponSchema);
export default Coupon;
