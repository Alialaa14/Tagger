import { Schema, model } from "mongoose";

const companySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      minLength: [3, "Company name must be at least 3 characters long"],
      maxLength: [50, "Company name must be at most 50 characters long"],
      trim: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      minLength: [3, "Company description must be at least 3 characters long"],
      maxLength: [
        500,
        "Company description must be at most 500 characters long",
      ],
      trim: true,
    },
    logo: {
      public_id: {
        type: String,
        required: [true, "Company logo is required"],
      },
      url: {
        type: String,
        required: [true, "Company logo is required"],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const Company = model("company", companySchema);
export default Company;
