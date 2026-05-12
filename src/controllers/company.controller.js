import Company from "../models/company.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

// GET /api/companies — all active companies (public)
const getActiveCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find({ isActive: true });
  res.json(new ApiResponse(200, companies, "Companies fetched successfully"));
});

// GET /api/companies/all — all companies (admin)
const getAllCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find();
  res.json(
    new ApiResponse(200, companies, "All companies fetched successfully"),
  );
});

// GET /api/companies/:id — single company (admin)
const getCompanyById = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw new ApiError(404, "Company not found");
  res.json(new ApiResponse(200, company, "Company fetched successfully"));
});

// POST /api/companies — create (admin)
const createCompany = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!req.file) throw new ApiError(400, "Company logo is required");

  const uploaded = await uploadToCloudinary(req.file.path);
  if (!uploaded) throw new ApiError(500, "Logo upload failed");

  const company = await Company.create({
    name,
    description,
    logo: {
      public_id: uploaded.public_id,
      url: uploaded.secure_url,
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, company, "Company created successfully"));
});

// PUT /api/companies/:id — update (admin)
const updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw new ApiError(404, "Company not found");

  const { name, description } = req.body;
  const update = { name, description };

  if (req.file) {
    // Delete old logo from Cloudinary first
    await deleteFromCloudinary(company.logo.public_id);

    const uploaded = await uploadToCloudinary(req.file.path);
    if (!uploaded) throw new ApiError(500, "Logo upload failed");

    update.logo = {
      public_id: uploaded.public_id,
      url: uploaded.secure_url,
    };
  }

  const updated = await Company.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });

  res.json(new ApiResponse(200, updated, "Company updated successfully"));
});

// PATCH /api/companies/:id/toggle — toggle isActive (admin)
const toggleCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw new ApiError(404, "Company not found");

  company.isActive = !company.isActive;
  await company.save();

  const msg = `Company ${company.isActive ? "activated" : "deactivated"} successfully`;
  res.json(new ApiResponse(200, company, msg));
});

// DELETE /api/companies/:id — delete (admin)
const deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw new ApiError(404, "Company not found");

  await deleteFromCloudinary(company.logo.public_id);
  await company.deleteOne();

  res.json(new ApiResponse(200, null, "Company deleted successfully"));
});

export {
  getActiveCompanies,
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  toggleCompany,
  deleteCompany,
};
