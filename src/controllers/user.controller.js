import User from "../models/user.model.js";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { forgetPasswordTemp } from "../utils/emailTemplates.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import { customAlphabet } from "nanoid";
import { sendEmail } from "../utils/sendEmail.js";
import { ENV } from "../utils/ENV.js";
import Cart from "../models/cart.model.js";
const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    await User.findByIdAndUpdate(userId, { refreshToken }, { new: true });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
  }
};

export const register = asyncHandler(async (req, res, next) => {
  const {
    username,
    shopName,
    phoneNumber,
    city,
    governorate,
    address,
    password,
    role = "user",
  } = req.body;

  // Check if User Already Exists (MobilePhone)
  const user = await User.findOne({ phoneNumber });

  if (user)
    return next(new ApiError(StatusCodes.CONFLICT, "User already exists"));

  // Upload Logo to Cloudinary if exists
  let logo = {};
  if (req?.file?.path) {
    const result = await uploadToCloudinary(
      req.file.path,
      `Tagger/logos/${username}-${shopName}`,
    );
    logo = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  // Create User
  const newUser = await User.create({
    username,
    shopName,
    phoneNumber,
    city,
    governorate,
    address,
    password,
    role,
    logo,
  });
  if (!newUser)
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Error While Creating User"),
    );

  // create Cart if user is Retail Custom (role==user)
  if (role === "user") {
    const cart = await Cart.create({ owner: newUser._id });
    if (!cart)
      return next(
        new ApiError(StatusCodes.BAD_REQUEST, "Error While Creating Cart"),
      );
  }
  return res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        newUser,
        "User Created Successfully",
      ),
    );
});

export const login = asyncHandler(async (req, res, next) => {
  const { phoneNumber, password } = req.body;
  const user = await User.findOne({ phoneNumber });
  if (!user) return next(new ApiError(StatusCodes.NOT_FOUND, "User not found"));
  const isMatch = await user.comparePassword(password);
  if (!isMatch)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid password"));

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id,
  );

  return res
    .status(StatusCodes.OK)
    .cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 3 * 24 * 60 * 60 * 1000,
    })
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json(new ApiResponse(StatusCodes.OK, user, "User logged in successfully"));
});

export const logout = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "No User Found"));

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { refreshToken: null },
    { new: true },
  );

  if (!updatedUser)
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Error While Logging Out User"),
    );

  return res
    .status(StatusCodes.OK)
    .clearCookie("accessToken", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 3 * 24 * 60 * 60 * 1000,
    })
    .clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(StatusCodes.OK, user, "User logged out successfully"),
    );
});

export const updateProfile = asyncHandler(async (req, res, next) => {
  const { username, shopName, phoneNumber, city, governorate, address } =
    req.body;

  const user = await User.findById(req.user.id);

  if (!user) return next(new ApiError(StatusCodes.NOT_FOUND, "User not found"));

  // Upload Logo to Cloudinary if exists
  let logo = {};
  if (req?.file?.path) {
    // Delete old logo from Cloudinary
    if (user.logo.public_id) {
      await deleteFromCloudinary(user.logo.public_id, "image");
    }
    const result = await uploadToCloudinary(
      req.file.path,
      `Tagger/logos/${username}-${shopName}`,
    );
    logo = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    {
      username,
      shopName,
      phoneNumber,
      city,
      governorate,
      address,
      logo,
    },
    { new: true },
  );

  if (!updatedUser)
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Error While Updating User"),
    );
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, updatedUser, "Profile Updated"));
});

export const forgetPassword = asyncHandler(async (req, res, next) => {
  const { phoneNumber, email } = req.body;

  const user = await User.findOne({ phoneNumber });
  if (!user)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "No User Found"));

  const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

  const updateUser = await User.findByIdAndUpdate(
    user._id,
    { otp: nanoid(), otpExpiry: Date.now() + 10 * 60 * 1000 },
    { new: true },
  );
  if (!updateUser)
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Error While Generating OTP"),
    );

  const isEmailSent = await sendEmail(
    email,
    "Password Reset",
    forgetPasswordTemp({ otp: updateUser.otp, name: updateUser.username }),
  );

  if (!isEmailSent)
    return next(
      new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Error While Sending Email",
      ),
    );

  // GENERATE ACCESS TOKEN
  const accessToken = jwt.sign({ id: user._id }, ENV.ACCESS_TOKEN, {
    expiresIn: "10m",
  });
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: ENV.NODE_ENV === "production",
    sameSite: ENV.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
  });
  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        null,
        "Password Reset Email Sent Successfully",
      ),
    );
});

export const verifyOtp = asyncHandler(async (req, res, next) => {
  const { otp } = req.body;
  const token = req?.cookies?.accessToken;

  if (!token)
    return next(new ApiError(StatusCodes.UNAUTHORIZED, "No Token Found"));
  const decoded = jwt.verify(token, ENV.ACCESS_TOKEN);
  if (!decoded)
    return next(new ApiError(StatusCodes.UNAUTHORIZED, "Invalid Token"));

  const user = await User.findOne({
    _id: decoded.id,
    otp,
  });

  if (!user)
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Invalid OTP or Expired"),
    );

  if (Date.now() > user.refreshPasswordTokenExpiry) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, "OTP Expired"));
  }
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, "OTP Verified Successfully"));
});

export const resetPassword = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  const token = req?.cookies?.accessToken;
  if (!token)
    return next(
      new ApiError(
        StatusCodes.UNAUTHORIZED,
        "Only Authorized User Can Reset Password",
      ),
    );

  const decoded = jwt.verify(token, ENV.ACCESS_TOKEN);
  if (!decoded)
    return next(new ApiError(StatusCodes.UNAUTHORIZED, "Invalid Token"));

  const user = await User.findById(decoded.id);
  if (!user)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "User Not Found"));

  user.password = password;
  user.otp = null;
  user.otpExpiry = null;

  const updatedUser = await user.save();
  if (!updatedUser)
    return next(
      new ApiError(StatusCodes.BAD_REQUEST, "Error While Resetting Password"),
    );
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, "Password Reset Successfully"));
});

export const getAllUsers = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    role,
    sortBy,
    sortOrder = "asc",
  } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let query = {};
  if (search) {
    query.$or = [
      {
        username: { $regex: search, $options: "i" },
        shopName: { $regex: search, $options: "i" },
        phoneNumber: { $regex: search, $options: "i" },
      },
    ];
  }
  if (role) {
    query.role = role;
  }
  const users = await User.find(query)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(Number(limit));
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, users, "Users Fetched Successfully"));
});

export const getUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const user = await User.findById(id)
    .populate("ordersAccepted", "id isAccepted totalPrice totalQuantity")
    .populate("ordersRejected", "id isAccepted totalPrice totalQuantity")
    .populate("favorites", "id name image");

  if (!user)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "User Not Found"));
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, user, "User Fetched Successfully"));
});

export const createAdminUser = asyncHandler(async (req, res, next) => {
  const { username, phoneNumber, password, role = "admin" } = req.body;

  if (role !== "admin")
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid Role"));

  // Check If This User Admin exists or not
  const user = await User.findOne({ username, role: "admin" });

  if (user)
    return next(new ApiError(StatusCodes.CONFLICT, "Admin Already Exists"));

  const newUser = await User.create({
    username,
    password,
    phoneNumber,
    role,
  });
  return res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        newUser,
        "Admin Created Successfully",
      ),
    );
});
