import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import Coupon from "../models/coupon.model.js";
import { StatusCodes } from "http-status-codes";

// @Desc Add To Cart
// @Route POST /api/v1/cart
// @Access Private
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productId, quantity = 1 } = req.body;

  const productExists = await Product.findById(productId);
  const existingCart = await Cart.findOne({ owner: req.user.id }).populate(
    "products.product",
    "name price image",
  );
  if (!productExists)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

  // ✅ Create cart if it doesn't exist yet
  let cart =
    existingCart ?? (await Cart.create({ owner: req.user.id, products: [] }));

  // ✅ item.product holds the ObjectId — not item.id
  // ✅ Arrow function uses implicit return (no curly braces)
  const index = cart.products.findIndex(
    (item) => item.product.id.toString() === productId.toString(),
  );

  if (index !== -1) {
    cart.products[index].quantity += quantity;
  } else {
    cart.products.push({ product: productExists._id, quantity });
  }

  // ✅ Calculate raw total first using item.product.price
  const rawTotal = cart.products.reduce((total, item) => {
    return total + item.quantity * productExists.price;
  }, 0);

  // ✅ Discount is now applied against the freshly computed rawTotal
  let discount = 0;
  if (cart.coupon) {
    const coupon = await Coupon.findById(cart.coupon);
    if (coupon) discount = rawTotal * (coupon.discount / 100);
  }

  cart.totalPrice = rawTotal - discount;
  cart.totalQuantity = cart.products.reduce((total, item) => {
    return total + item.quantity;
  }, 0);

  const updatedCart = await cart.save();
  if (!updatedCart)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Cart Not Updated"));

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        cart: updatedCart,
        totalPrice: cart.totalPrice,
        totalQuantity: cart.totalQuantity,
      },
      "Product Added To Cart Successfully",
    ),
  );
});
// @Desc Remove From Cart
// @Route DELETE /api/v1/cart/?productId
// @Access Private
export const removeFromCart = asyncHandler(async (req, res, next) => {
  const product = req.query.productId;

  const productExists = await Product.findById(product);
  if (!productExists)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  // check if the product is already in the cart
  const index =
    cart.products.length > 0
      ? cart.products.map((item, index) => {
          if (item.product.toString() == product.toString()) return index;
        })
      : -1;

  if (index == -1) {
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));
  }

  // Check if Cart has Coupon and Apply it
  let discount = 0;
  if (cart.coupon) {
    const coupon = await Coupon.findById(cart.coupon);
    discount = cart.totalPrice * coupon.discount;
  }

  // Calculate Cart Total Price and Quantity
  const totalPrice =
    cart.totalPrice -
    cart.products[index].quantity * productExists.price -
    discount;
  const totalQuantity = cart.totalQuantity - cart.products[index].quantity;
  // Remove Product
  cart.products.splice(index, 1);

  cart.totalPrice = totalPrice;
  cart.totalQuantity = totalQuantity;
  const updatedCart = await cart.save();
  if (!updatedCart)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Cart Not Updated"));

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { updatedCart, totalPrice, totalQuantity },
        "Product Removed From Cart",
      ),
    );
});
// @Desc Update Cart Details
// @Route Patch /api/v1/cart
// @Access Private
export const updateCart = asyncHandler(async (req, res, next) => {
  const { note, coupon } = req.body;

  // Find Cart Related To User
  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  if (coupon) {
    const couponExists = await Coupon.findOne({ name: coupon });
    if (!couponExists)
      return next(new ApiError(StatusCodes.NOT_FOUND, "Coupon Not Found"));
    if (couponExists.isUsed)
      return next(new ApiError(StatusCodes.BAD_REQUEST, "Coupon Already Used"));
    if (Date.now() > couponExists.expiry)
      return next(new ApiError(StatusCodes.BAD_REQUEST, "Coupon Expired"));
    await Coupon.findByIdAndUpdate(couponExists._id, {
      isUsed: true,
      usedBy: req.user._id,
    });
    const updatedCart = await Cart.findOneAndUpdate(
      { owner: req.user.id },
      {
        coupon: couponExists._id,
        totalPrice: cart.totalPrice - couponExists.discount,
      },
      { new: true },
    );
    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          updatedCart,
          "Coupon Applied Successfully",
        ),
      );
  }

  // Update Cart note
  const updatedCart = await Cart.findOneAndUpdate(
    { owner: req.user.id },
    {
      note: note || cart.note,
    },
    {
      new: true,
    },
  );

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, updatedCart, "Note Updated Successfully"),
    );
});

// @Desc Get Cart
// @Route GET /api/v1/cart/?userId
// @Access Private byUserId by admin , Without userid by user
export const getCart = asyncHandler(async (req, res, next) => {
  const userId = req.query.userId;

  let cart = null;
  if (userId) {
    cart = await Cart.findOne({ owner: userId })
      .populate("owner", "username shopName")
      .populate("products.product", "name price image");
  } else {
    cart = await Cart.findOne({ owner: req.user.id }).populate(
      "products.product",
      "name price image",
    );
  }

  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, cart, "Cart Fetched"));
});

// @Desc Get All Carts
// @Route GET /api/v1/cart
// @Access Private for admin
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
// @Route DELETE /api/v1/cart
// @Access Private
export const clearCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOneAndUpdate(
    {
      owner: req.user.id,
      products: { $ne: [] },
    },
    {
      $set: {
        products: [],
        note: "",
        coupon: null,
        totalPrice: 0,
        totalQuantity: 0,
      },
    },
  );

  if (!cart)
    return next(
      new ApiError(
        StatusCodes.NOT_FOUND,
        "Cart Not Found or Cart Already Empty",
      ),
    );

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, cart, "Cart Cleared"));
});

// @Desc Change Quantity
// @Route PATCH /api/v1/cart?productId
export const changeQunantity = asyncHandler(async (req, res, next) => {
  const product = req.query.productId;
  const opt = req.query.opt;
  if (opt !== "inc" && opt !== "dec")
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Invalid Operation"));
  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));
  const productExists = await Product.findById(product);
  if (!productExists)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));
  const index = cart.products.findIndex(
    (item) => item.product.toString() === product,
  );
  if (index === -1)
    return next(new ApiError(StatusCodes.NOT_FOUND, "Product Not Found"));

  if (opt === "inc") {
    cart.products[index].quantity++;
  } else {
    if (cart.products[index].quantity === 1) {
      cart.products.splice(index, 1);
    } else {
      cart.products[index].quantity--;
    }
  }
  const updatedCart = await cart.save();
  if (!updatedCart)
    return next(new ApiError(StatusCodes.BAD_REQUEST, "Cart Not Updated"));

  // Check if Cart has Coupon and Apply it
  let discount = 0;
  if (cart.coupon) {
    const coupon = await Coupon.findById(cart.coupon);
    discount = coupon.discount;
  }

  cart.totalPrice =
    updatedCart.products.reduce((total, item) => {
      return total + item.quantity * productExists.price;
    }, 0) - discount;
  cart.totalQuantity = updatedCart.products.reduce((total, item) => {
    return total + item.quantity;
  }, 0);
  await cart.save();

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        updatedCart,
        totalPrice: cart.totalPrice,
        totalQuantity: cart.totalQuantity,
      },
      "Cart Updated",
    ),
  );
});

export const cancelCoupon = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ owner: req.user.id });
  if (!cart) return next(new ApiError(StatusCodes.NOT_FOUND, "Cart Not Found"));
  if (cart.coupon) {
    const coupon = await Coupon.findById(cart.coupon);
    await Coupon.findByIdAndUpdate(coupon._id, {
      isUsed: false,
      usedBy: null,
    });
    const updatedCart = await Cart.findOneAndUpdate(
      { owner: req.user.id },
      {
        coupon: null,
        totalPrice: cart.totalPrice + coupon.discount,
      },
      { new: true },
    );
    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, updatedCart, "Coupon Cancelled"));
  }
});
