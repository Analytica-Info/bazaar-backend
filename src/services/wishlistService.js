const Wishlist = require("../models/Wishlist");

async function getWishlist(userId) {
  const wishlist = await Wishlist.findOne({ user: userId }).populate("items");
  if (!wishlist) {
    return { wishlistCount: 0, wishlist: [] };
  }
  return { wishlistCount: wishlist.items.length, wishlist: wishlist.items };
}

async function addToWishlist(userId, productId) {
  if (!productId) {
    throw { status: 400, message: "productId is required" };
  }

  let wishlist = await Wishlist.findOne({ user: userId });

  if (!wishlist) {
    wishlist = new Wishlist({ user: userId, items: [productId] });
  } else {
    const alreadyExists = wishlist.items.some(
      (item) => item.toString() === productId
    );
    if (alreadyExists) {
      throw { status: 400, message: "Product already in wishlist" };
    }
    wishlist.items.push(productId);
  }

  await wishlist.save();
  return { wishlist };
}

async function removeFromWishlist(userId, productId) {
  if (!productId) {
    throw { status: 400, message: "productId is required" };
  }

  await Wishlist.findOneAndUpdate(
    { user: userId },
    { $pull: { items: productId } }
  );

  return {};
}

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
};
