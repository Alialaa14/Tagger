import User from "../models/user.model.js";
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

export const autoChooseTrader = async (users) => {
  if (!users || users.length === 0) return null;

  const traders = await User.find({ role: "trader", _id: { $in: users } });

  if (traders.length === 0) return null;

  const rankedTraders = traders.filter((user) => user.rank > 0);
  const unrankedTraders = traders.filter((user) => user.rank === 0);

  const pickUnranked = unrankedTraders.length > 0 && Math.random() < 0.3;

  if (pickUnranked) {
    const randomIndex = Math.floor(Math.random() * unrankedTraders.length);
    return unrankedTraders[randomIndex];
  }

  if (rankedTraders.length === 0) {
    const randomIndex = Math.floor(Math.random() * unrankedTraders.length);
    return unrankedTraders[randomIndex];
  }

  // Higher rank number = better, so pick the max
  const bestTrader = rankedTraders.reduce(
    (best, current) => (current.rank > best.rank ? current : best),
    rankedTraders[0],
  );

  return bestTrader;
};
