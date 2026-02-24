import { Schema, model } from "mongoose";

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Category Name is required"],
      minLength: [3, "Category Name must be at least 3 characters long"],
      maxLength: [20, "Category Name must be at most 50 characters long"],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      minLength: [3, "Category Description must be at least 3 characters long"],
      maxLength: [
        50,
        "Category Description must be at most 50 characters long",
      ],
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
  },
  { timeStamps: true },
);

const Category = model("category", categorySchema);

export default Category;
