import { Schema, model } from "mongoose";

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Product Name is required"],
      minLength: [3, "Product Name must be at least 3 characters long"],
      maxLength: [50, "Product Name must be at most 50 characters long"],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      minLength: [3, "Product Description must be at least 3 characters long"],
      maxLength: [50, "Product Description must be at most 50 characters long"],
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
    price: {
      type: Number,
      required: [true, "Price is required"],
    },
    discount: [
      {
        quantity: {
          type: Number,
        },
        discountValue: {
          type: Number,
        },
      },
    ],
  },
  { timeStamps: true },
);

const Product = model("product", productSchema);
export default Product;
