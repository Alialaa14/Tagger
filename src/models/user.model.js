import { Schema, model } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../utils/ENV.js";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      minLength: [4, "Username must be at least 4 characters long"],
      maxLength: [20, "Username must be at most 20 characters long"],
      trim: true,
      index: true,
    },
    shopName: {
      type: String,
      required: function () {
        return this.role === "user" || this.role === "trader";
      },
      minLength: [4, "Shopname must be at least 4 characters long"],
      maxLength: [20, "Shopname must be at most 20 characters long"],
      trim: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone Number is required"],
      minLength: [11, "Phone number must be at least 10 characters long"],
      maxLength: [11, "Phone number must be at most 10 characters long"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minLength: [8, "Password must be at least 8 characters long"],
      maxLength: [20, "Password must be at most 20 characters long"],
    },
    city: {
      type: String,
      required: function () {
        return this.role === "user" || this.role === "trader";
      },
      trim: true,
    },
    governorate: {
      type: String,
      required: function () {
        return this.role === "user" || this.role === "trader";
      },
      trim: true,
    },
    address: {
      type: String,
      required: function () {
        return this.role === "user" || this.role === "trader";
      },
      trim: true,
    },
    logo: {
      public_id: String,
      url: {
        type: String,
        default:
          "https://img.freepik.com/premium-vector/character-avatar-isolated_729149-194801.jpg?semt=ais_user_personalization&w=740&q=80",
      },
    },
    role: {
      type: String,
      enum: ["user", "trader", "admin"],
      default: "user",
    },
    rank: {
      type: Number,
      default: 0,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
    totalOrdersAccepted: {
      type: Number,
      default: 0,
    },
    totalOrdersRejected: {
      type: Number,
      default: 0,
    },
    // ordersAccepted: [
    //   {
    //     type: Schema.Types.ObjectId,
    //     ref: "order",
    //   },
    // ],

    // ordersRejected: [
    //   {
    //     type: Schema.Types.ObjectId,
    //     ref: "order",
    //   },
    // ],

    favorites: [
      {
        type: Schema.Types.ObjectId,
        ref: "product",
      },
    ],

    refreshToken: String,
    otp: {
      type: String,
      default: "",
    },
    otpExpiry: {
      type: Date,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign({ id: this._id }, ENV.ACCESS_TOKEN, {
    expiresIn: ENV.ACCESS_TOKEN_EXPIRY,
  });
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ id: this._id }, ENV.REFRESH_TOKEN, {
    expiresIn: ENV.REFRESH_TOKEN_EXPIRY,
  });
};

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = model("user", userSchema);
export default User;
