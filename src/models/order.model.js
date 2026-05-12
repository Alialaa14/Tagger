import { Schema, model } from "mongoose";
import User from "./user.model.js"

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
        traderPrice: {
          type: Number,
          default: 0,
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
    city: {
      type: String,
      trim: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    customerPhone: {
      type: String,
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
    totalTraderPrice: {
      type: Number,
      default: 0,
    },
    history: [
      {
        phase: {
          type: String,
          enum: [
            "pending",
            "taken",
            "accepted",
            "cancelled",
            "rejected",
            "shipped",
            "delivered",
            "auto forward",
            "reforward",
          ],
          required: [true, "Phase is required"],
        },
        date: {
          type: Date,
          default: Date.now,
        },
        doneBy: {
          type: Schema.Types.ObjectId,
          ref: "user",
          default: null,
        }
      },
    ],
    takenAt: {
      type: Date,
      default: null,
    },
    triedTraderIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "user",
      }
    ],
  },
  { timestamps: true },
);

orderSchema.methods.getFormattedHistory = async function () {
  return await Promise.all(
    this.history.map(async (entry) => {
      let text = "";
      const doneBy = entry.doneBy;

      let user = null;
      if (doneBy) {
        if (doneBy.role) {
          user = doneBy;
        } else {
          user = await User.findById(doneBy);
        }
      }

      const name = user ? user.shopName || user.username || "مستخدم" : "النظام";

      let roleStr = "";
      if (user && user.role) {
        if (user.role === "user") roleStr = "المستخدم";
        else if (user.role === "trader") roleStr = "التاجر";
        else if (user.role === "admin") roleStr = "المسؤول";
        else roleStr = user.role;
      }

      const identifier = roleStr ? `${roleStr} ${name}` : name;

      switch (entry.phase) {
        case "pending":
          text = "تم تقديم الطلب وهو قيد الانتظار";
          break;
        case "taken":
          text = `تم استلام الطلب بواسطة ${identifier}`;
          break;
        case "accepted":
          text = `تم قبول الطلب بواسطة ${identifier}`;
          break;
        case "cancelled":
          text = `تم إلغاء الطلب بواسطة ${identifier}`;
          break;
        case "rejected":
          text = `تم رفض الطلب بواسطة ${identifier}`;
          break;
        case "shipped":
          text = `تم شحن الطلب بواسطة ${identifier}`;
          break;
        case "delivered":
          text = `تم توصيل الطلب بواسطة ${identifier}`;
          break;
        case "auto forward":
          text = `تم تحويل الطلب تلقائياً إلى تاجر آخر ${identifier}`;
          break;
        case "reforward":
          text = `تم إعادة تحويل الطلب إلى تاجر آخر  ${identifier}`;
          break;
        default:
          text = `تم تغيير حالة الطلب إلى ${entry.phase}`;
      }

      return {
        ...entry.toObject(),
        phaseText: text,
      };
    })
  );
};

const Order = model("order", orderSchema);
export default Order;
