import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import Coupon from "../models/coupon.model.js";
import { StatusCodes } from "http-status-codes";

// ─── Helper Functions ────────────────────────────────────────────────────────
const calculateCartTotals = async (cart) => {
  // Populate product details to get prices
  await cart.populate("products.product", "name price image");

  let totalRaw = 0;
  let totalQuantity = 0;

  cart.products.forEach((item) => {
    if (item.product) {
      totalRaw += item.quantity * item.product.price;
      totalQuantity += item.quantity;
    }
  });

  let discount = 0;
  if (cart.coupon) {
    const coupon = await Coupon.findById(cart.coupon);
    if (coupon) {
      // User confirmed: Fixed amount discount
      discount = coupon.discount;
    } else {
      // Coupon might have been deleted
      cart.coupon = null;
    }
  }

  cart.totalPrice = Math.max(0, totalRaw - discount);
  cart.totalQuantity = totalQuantity;
  return cart;
};

// @Desc Add To Cart
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productId, quantity = 1 } = req.body;

  const productExists = await Product.findById(productId);
  if (!productExists)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

  let cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) {
    cart = await Cart.create({ owner: req.user.id, products: [] });
  }


  const index = cart.products.findIndex(
    (item) => item.product.toString() === productId.toString(),
  );

  if (index !== -1) {
    cart.products[index].quantity += quantity;
  } else {
    cart.products.push({ product: productId, quantity });
  }

  await calculateCartTotals(cart);
  const updatedCart = await cart.save();
  await updatedCart.populate("coupon", "name discount");

  if (!updatedCart)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Cart Not Updated"));

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        cart: updatedCart,
        totalPrice: updatedCart.totalPrice,
        totalQuantity: updatedCart.totalQuantity,
      },
      "Product Added To Cart Successfully",
    ),
  );
});

// @Desc Remove From Cart
export const removeFromCart = asyncHandler(async (req, res, next) => {
  const productId = req.query.productId;

  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  const index = cart.products.findIndex(
    (item) => item.product.toString() === productId.toString(),
  );

  if (index === -1) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found In Cart"));
  }

  cart.products.splice(index, 1);

  await calculateCartTotals(cart);
  const updatedCart = await cart.save();
  await updatedCart.populate("coupon", "name discount");

  if (!updatedCart)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Cart Not Updated"));

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      { updatedCart, totalPrice: updatedCart.totalPrice, totalQuantity: updatedCart.totalQuantity },
      "Product Removed From Cart",
    ),
  );
});
// @Desc Update Cart Details
export const updateCart = asyncHandler(async (req, res, next) => {
  const { note, coupon } = req.body;

  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  if (coupon) {
    const couponExists = await Coupon.findOne({ name: coupon });
    if (!couponExists)
      return next(new ApiError(StatusCodes.NOT_FOUND, "Coupon Not Found"));
    if (couponExists.isUsed) {
      const isAlreadyInCart = cart.coupon && cart.coupon.toString() === couponExists._id.toString();
      if (!isAlreadyInCart) {
        return next(new ApiError(StatusCodes.BAD_REQUEST, "هذا الكوبون مستخدم بالفعل"));
      }
    }

    if (Date.now() > couponExists.expiry)
      return next(new ApiError(StatusCodes.BAD_REQUEST, "Coupon Expired"));

    // Revert old coupon if exists
    if (cart.coupon && cart.coupon.toString() !== couponExists._id.toString()) {
      const oldCoupon = await Coupon.findById(cart.coupon);
      if (oldCoupon) {
        oldCoupon.usedCount = Math.max(0, oldCoupon.usedCount - 1);
        const idx = oldCoupon.usedBy.findIndex(id => id.toString() === req.user.id);
        if (idx > -1) oldCoupon.usedBy.splice(idx, 1);
        if (oldCoupon.usedCount < oldCoupon.maxUse) oldCoupon.isUsed = false;
        await oldCoupon.save();
      }
    }

    // Mark as used
    const isAlreadyInCart = cart.coupon && cart.coupon.toString() === couponExists._id.toString();
    if (!isAlreadyInCart) {
      couponExists.usedCount += 1;
      couponExists.usedBy.push(req.user.id);
      if (couponExists.usedCount >= couponExists.maxUse) couponExists.isUsed = true;
      await couponExists.save();
    }

    cart.coupon = couponExists._id;
  }

  if (note !== undefined) {
    cart.note = note;
  }

  await calculateCartTotals(cart);
  const updatedCart = await cart.save();
  await updatedCart.populate("coupon", "name discount");

  return res.status(StatusCodes.OK).json(
    new ApiResponse(StatusCodes.OK, updatedCart, "Cart Updated Successfully"),
  );
});

// @Desc Get Cart
export const getCart = asyncHandler(async (req, res, next) => {
  const userId = req.query.userId;

  let cart = null;
  if (userId) {
    cart = await Cart.findOne({ owner: userId })
      .populate("owner", "username shopName")
      .populate("products.product", "name price image")
      .populate("coupon", "name discount");
  } else {
    cart = await Cart.findOne({ owner: req.user.id })
      .populate("products.product", "name price image")
      .populate("coupon", "name discount");
  }

  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, cart, "Cart Fetched"));
});

// @Desc Get All Carts
export const getAllCarts = asyncHandler(async (req, res, next) => {
  const carts = await Cart.find().populate("owner", "username shopName");
  if (!carts || carts.length === 0) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "There are no Carts"));
  }
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, carts, "Carts Fetched"));
});

// @Desc Clear Cart
export const clearCart = asyncHandler(async (req, res, next) => {
  // Revert coupon if present
  // Note: we fetch the original cart before updating to know if it had a coupon
  const oldCart = await Cart.findOne({ owner: req.user.id });

  const cart = await Cart.findOneAndUpdate(
    { owner: req.user.id },
    {
      $set: {
        products: [],
        note: "",
        coupon: null,
        totalPrice: 0,
        totalQuantity: 0,
      },
    },
    { new: true }
  ).populate("products.product", "name price image");

  if (!cart)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  if (oldCart && oldCart.coupon) {
    const couponDoc = await Coupon.findById(oldCart.coupon);
    if (couponDoc) {
      couponDoc.usedCount = Math.max(0, couponDoc.usedCount - 1);
      const idx = couponDoc.usedBy.findIndex(id => id.toString() === req.user.id);
      if (idx > -1) couponDoc.usedBy.splice(idx, 1);
      if (couponDoc.usedCount < couponDoc.maxUse) couponDoc.isUsed = false;
      await couponDoc.save();
    }
  }

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, cart, "Cart Cleared"));
});

// @Desc Change Quantity
export const changeQunantity = asyncHandler(async (req, res, next) => {
  const productId = req.query.productId;
  const opt = req.query.opt;

  if (opt !== "inc" && opt !== "dec")
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid Operation"));

  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  const index = cart.products.findIndex(
    (item) => item.product.toString() === productId,
  );
  if (index === -1)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found In Cart"));

  if (opt === "inc") {
    cart.products[index].quantity++;
  } else {
    if (cart.products[index].quantity === 1) {
      cart.products.splice(index, 1);
    } else {
      cart.products[index].quantity--;
    }
  }

  await calculateCartTotals(cart);
  const updatedCart = await cart.save();
  await updatedCart.populate("coupon", "name discount");

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        updatedCart,
        totalPrice: updatedCart.totalPrice,
        totalQuantity: updatedCart.totalQuantity,
      },
      "Cart Updated",
    ),
  );
});

export const cancelCoupon = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  if (cart.coupon) {
    await Coupon.findByIdAndUpdate(cart.coupon, { isUsed: false, $pull: { usedBy: req.user.id }, $inc: { usedCount: -1 } }, { new: true });
  }

  cart.coupon = null;
  await calculateCartTotals(cart);
  const updatedCart = await cart.save();
  await updatedCart.populate("products.product", "name price image");

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, updatedCart, "Coupon Cancelled"));
});
