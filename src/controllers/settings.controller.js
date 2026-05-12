import { getPlatformSettings, updatePlatformSettings } from "../utils/settingsHelper.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { StatusCodes } from "http-status-codes";

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await getPlatformSettings();
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, settings, "Settings fetched successfully"));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await updatePlatformSettings(req.body);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, settings, "Settings updated successfully"));
});
