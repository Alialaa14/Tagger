import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { StatusCodes } from "http-status-codes";

// @Desc create Category
// @Route POST /api/v1/category
// @Access Private
export const createCategory = asyncHandler(async (req, res, next) => {
  const { name, description } = req.body;

  // Check if another Category has the same name
  const category = await Category.findOne({ name });
  if (category)
    return next(new ApiError(StatusCodes.CONFLICT, "Category Already Exists"));

  // Upload To Cloudinary
  let imageUpload = {};
  if (req?.file?.path) {
    const result = await uploadToCloudinary(req.file.path, "Tagger/categories");
    imageUpload = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  const newCategory = await Category.create({
    name,
    description,
    image: imageUpload,
  });

  if (!newCategory)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Category Not Created"));

  return res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(StatusCodes.CREATED, newCategory, "Category Created"),
    );
});

// @Desc Update Category By Admin
// @Route PATCH /api/v1/category/:id
// @Access Private

export const updateCategory = asyncHandler(async (req, res, next) => {
  const categoryId = req.params.id;
  const { name, description } = req.body;

  const category = await Category.findById(categoryId);

  if (!category)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Category Not Found"));

  // Upload To Cloudinary
  let imageUpload = {};
  if (req?.file?.path) {
    // Delete old Image from Cloudinary
    if (category.image.public_id) {
      await deleteFromCloudinary(category.image.public_id, "image");
    }
    const result = await uploadToCloudinary(req.file.path, "Tagger/categories");
    imageUpload = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  const updatedCategory = await Category.findByIdAndUpdate(
    categoryId,
    {
      name: name || category.name,
      description: description || category.description,
      image: imageUpload || category.image,
    },
    { new: true },
  );

  if (!updatedCategory)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Category Not Updated"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, updatedCategory, "Category Updated"));
});

// @Desc Delete Category By Admin
// @Route Delete /api/v1/category/:id
// @Access Private

export const deleteCategory = asyncHandler(async (req, res, next) => {
  const categoryId = req.params.id;

  const category = await Category.findById(categoryId);

  if (!category)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Category Not Found"));
  // Delete Image from Cloudinary
  if (category.image?.public_id) {
    await deleteFromCloudinary(category.image.public_id, "image");
  }
  const deletedCategory = await Category.findByIdAndDelete(categoryId);
  if (!deletedCategory)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Category Not Deleted"));

  const deletedProducts = await Product.deleteMany({ category: category._id });
  if (!deletedProducts)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Products Not Deleted"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, deletedCategory, "Category Deleted"));
});

// @Desc Get All Categories
// @Route GET /api/v1/category
// @Access Public
export const getAllCategories = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    sortBy = "name",
    sortOrder = "asc",
  } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let query = {};
  if (search) {
    query.$or = [
      {
        name: { $regex: search, $options: "i" },
        description: { $regex: search, $options: "i" },
      },
    ];
  }
  const categories = await Category.find(query)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(Number(limit));
  if (!categories || categories.length === 0) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Categories Not Found"));
  }

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        categories,
        "Categories Fetched Successfully",
      ),
    );
});

// @Desc Get Category By Id
// @Route GET /api/v1/category/:id
// @Access Public
export const getCategoryById = asyncHandler(async (req, res, next) => {
  const categoryId = req.params.id;
  const {
    page = 1,
    limit = 10,
    search,
    sortBy = "name",
    sortOrder = "asc",
  } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let query = {};
  if (search) {
    query.$or = [
      {
        name: { $regex: search, $options: "i" },
        description: { $regex: search, $options: "i" },
      },
    ];
  }

  const category = await Category.findById(categoryId);

  if (!category)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Category Not Found"));

  const categoryProducts = await Product.find({
    category: category._id,
    ...query,
  })
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(Number(limit));

  if (!categoryProducts || categoryProducts.length === 0) {
    return next(
      new ApiError(StatusCodes.NOT_FOUND, "Category Products Not Found"),
    );
  }

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { category, categoryProducts },
        "Category Products Fetched Successfully",
      ),
    );
});
