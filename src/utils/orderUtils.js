import User from "../models/user.model.js";
import TraderProduct from "../models/traderProduct.js";
import { getPlatformSettings } from "./settingsHelper.js";

export const calculateOrderRank = (products) => {
  if (!products || products.length === 0) return 0;

  const productCount = products.length;

  const totalQuantity = products.reduce(
    (sum, product) => sum + product.quantity,
    0,
  );

  const totalPrice = products.reduce(
    (sum, product) => sum + product.totalPrice,
    0,
  );

  const rankScore = productCount * 2 + totalQuantity * 1.5 + totalPrice / 100;

  return rankScore;
};




/**
 * findBestTrader
 * Logic:
 * 1. Get online traders not in excludeIds.
 * 2. Filter those who have ALL products in the order.
 * 3. Calculate their totalTraderPrice.
 * 4. SKIP if totalTraderPrice > platformPrice (totalAmount of the order).
 * 5. Sort by Rank (desc).
 */
export const findBestTrader = async (products, excludeIds = [], platformPrice) => {
  if (!products || products.length === 0) return null;

  const onlineTraders = await User.find({
    role: "trader",
    isOnline: true,
    _id: { $nin: excludeIds },
  });

  if (onlineTraders.length === 0) return null;

  const eligibleTraders = [];

  for (const trader of onlineTraders) {
    let currentTraderTotalPrice = 0;
    let hasAllProducts = true;
    const traderProducts = [];

    for (const item of products) {
      const productId = (item.productId?._id || item.productId)?.toString();
      const record = await TraderProduct.findOne({
        traderId: trader._id,
        productId: productId,
      });

      if (!record) {
        hasAllProducts = false;
        break;
      }

      const itemPrice = record.price * item.quantity;
      currentTraderTotalPrice += itemPrice;
      traderProducts.push({
        ...item.toObject ? item.toObject() : item,
        traderPrice: itemPrice,
      });
    }

    // Skip if missing products or price is too high (higher than what user pays)
    // Filter out traders whose price is too high (if ceiling is enabled)
    const settings = await getPlatformSettings();
    const isPriceCeilingActive = settings.priceCeilingEnabled;

    if (!hasAllProducts || (isPriceCeilingActive && currentTraderTotalPrice > platformPrice)) {
      continue;
    }

    eligibleTraders.push({
      trader,
      totalTraderPrice: currentTraderTotalPrice,
      products: traderProducts,
    });
  }

  if (eligibleTraders.length === 0) return null;

  // Sort by Rank desc, then price asc
  eligibleTraders.sort((a, b) => {
    if (b.trader.rank !== a.trader.rank) {
      return b.trader.rank - a.trader.rank;
    }
    return a.totalTraderPrice - b.totalTraderPrice;
  });
  return eligibleTraders;
};
