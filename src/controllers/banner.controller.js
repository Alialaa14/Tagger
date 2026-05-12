import Banner from "../models/banner.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

// GET /api/banners — active only (home page)
export const getActiveBanners = asyncHandler(async (req, res) => {
  const banners = await Banner.find({ isActive: true }).sort({ order: 1 });
  res.json(
    new ApiResponse(200, banners, "Active banners fetched successfully"),
  );
});

// GET /api/banners/all — all banners (admin)
export const getAllBanners = asyncHandler(async (req, res) => {
  const banners = await Banner.find().sort({ order: 1 });
  res.json(new ApiResponse(200, banners, "All banners fetched successfully"));
});

// GET /api/banners/:id — single banner
export const getBannerById = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw new ApiError(404, "Banner not found");
  res.json(new ApiResponse(200, banner, "Banner fetched successfully"));
});

// POST /api/banners — create
export const createBanner = asyncHandler(async (req, res) => {
  const { title, subtitle, buttonText, buttonLink, isActive, order } = req.body;

  let imageUrl;
  if (req.file) {
    const uploadResult = await uploadToCloudinary(req.file.path, "banners");
    imageUrl = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
  } else if (req.body.imageUrl) {
    imageUrl = { url: req.body.imageUrl };
  } else {
    throw new ApiError(400, "Image is required");
  }

  const banner = new Banner({
    title,
    subtitle,
    imageUrl,
    buttonText,
    buttonLink,
    isActive: isActive !== undefined ? isActive : true,
    order: order || 0,
  });

  const saved = await banner.save();
  res
    .status(201)
    .json(new ApiResponse(201, saved, "Banner created successfully"));
});

// PUT /api/banners/:id — update
export const updateBanner = asyncHandler(async (req, res) => {
  const { title, subtitle, buttonText, buttonLink, isActive, order } = req.body;
  const update = { title, subtitle, buttonText, buttonLink, isActive, order };
  const existingBanner = await Banner.findById(req.params.id);
  if (!existingBanner) throw new ApiError(404, "Banner not found");
  if (req.file) {
    if (existingBanner.imageUrl.public_id) {
      await deleteFromCloudinary(existingBanner.imageUrl.public_id);
    }
    const uploadResult = await uploadToCloudinary(req.file.path, "banners");
    update.imageUrl = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
  } else if (req.body.imageUrl) {
    update.imageUrl = { url: req.body.imageUrl };
  }

  const banner = await Banner.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });

  if (!banner) throw new ApiError(404, "Banner not found");
  res.json(new ApiResponse(200, banner, "Banner updated successfully"));
});

// PATCH /api/banners/:id/toggle — toggle isActive
export const toggleBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw new ApiError(404, "Banner not found");

  banner.isActive = !banner.isActive;
  await banner.save();

  const msg = `Banner ${banner.isActive ? "activated" : "deactivated"} successfully`;
  res.json(new ApiResponse(200, banner, msg));
});

// DELETE /api/banners/:id — delete
export const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw new ApiError(404, "Banner not found");
  if (banner.imageUrl.public_id) {
    await deleteFromCloudinary(banner.imageUrl.public_id);
  }
  res.json(new ApiResponse(200, null, "Banner deleted successfully"));
});
