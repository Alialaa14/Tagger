import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Product from "../models/product.model.js";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────
// @Desc    Get Product Statistics with Aggregation
// @Route   GET /api/v1/product/stats
// @Access  Private — admin only
// ─────────────────────────────────────────────────────────────
export const getProductStats = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    company,
    sortBy = "sold",
    sortOrder = "desc",
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const limitNum = Number(limit);

  // 1. Build Match Filter
  const matchFilter = {};
  if (search) {
    matchFilter.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (category) matchFilter.category = new mongoose.Types.ObjectId(category);
  if (company) matchFilter.company = new mongoose.Types.ObjectId(company);

  // 2. Aggregation Pipeline
  const pipeline = [
    { $match: matchFilter },
    {
      $facet: {
        // Aggregate totals for the entire match set (ignoring pagination)
        totals: [
          {
            $group: {
              _id: null,
              totalSoldUnits: { $sum: "$sold" },
              totalRevenue: { $sum: "$totalSales" },
              totalInquiries: { $sum: { $size: { $ifNull: ["$userAsksAvailabilty", []] } } },
              totalProducts: { $sum: 1 },
            },
          },
        ],
        // Paginated results
        products: [
          { $sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 } },
          { $skip: skip },
          { $limit: limitNum },
          {
            $lookup: {
              from: "categories",
              localField: "category",
              foreignField: "_id",
              as: "categoryInfo",
            },
          },
          {
            $lookup: {
              from: "companies",
              localField: "company",
              foreignField: "_id",
              as: "companyInfo",
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "userAsksAvailabilty",
              foreignField: "_id",
              as: "userAsksAvailabilty",
              pipeline: [
                { $project: { username: 1, shopName: 1, phoneNumber: 1 } }
              ]
            }
          },
          {
            $addFields: {
              category: { $arrayElemAt: ["$categoryInfo", 0] },
              company: { $arrayElemAt: ["$companyInfo", 0] },
            }
          },
          {
            $project: {
              categoryInfo: 0,
              companyInfo: 0,
            }
          }
        ],
      },
    },
    {
      $addFields: {
        totals: { $arrayElemAt: ["$totals", 0] },
      },
    },
  ];

  const [results] = await Product.aggregate(pipeline);

  const totals = results.totals || { totalSoldUnits: 0, totalRevenue: 0, totalProducts: 0 };
  const products = results.products || [];

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        totals,
        products,
        pagination: {
          total: totals.totalProducts,
          page: Number(page),
          totalPages: Math.ceil(totals.totalProducts / limitNum),
        },
      },
      "Product statistics fetched successfully"
    )
  );
});
