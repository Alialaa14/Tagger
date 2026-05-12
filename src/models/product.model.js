import { Schema, model } from "mongoose";

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      minLength: [3, "Product name must be at least 3 characters long"],
      maxLength: [20, "Product name must be at most 20 characters long"],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      minLength: [3, "Product description must be at least 3 characters long"],
      maxLength: [50, "Product description must be at most 50 characters long"],
      trim: true,
    },
    image: {
      public_id: {
        type: String,
        required: [true, "Image is required"],
      },
      url: {
        type: String,
        required: [true, "Image is required"],
      },
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "category",
      required: [true, "Category is required"],
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: "company",
      required: [true, "Company is required"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
    },
    sold: {
      type: Number,
      default: 0,
    },
    totalSales: {
      type: Number,
      default: 0
    },

    userAsksAvailabilty: [
      {
        type: Schema.Types.ObjectId,
        ref: "user",
      }
    ],
    unitQuantity: {
      type: Number,
      required: [true, "Please Provide us unitQuantity"]
    }
  },
  { timestamps: true },
);

const Product = model("product", productSchema);
export default Product;
