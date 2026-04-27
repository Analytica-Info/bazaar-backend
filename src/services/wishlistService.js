const Wishlist = require("../models/Wishlist");

async function getWishlist(userId) {
  // Exclude large internal Lightspeed sync fields — same set as LIST_EXCLUDE_SELECT
  // used across product list endpoints. Exclusion projection stays forward-compatible.
  const WISHLIST_PRODUCT_EXCLUDE = [
    "product.variants", "product.product_codes", "product.suppliers",
    "product.composite_bom", "product.tag_ids", "product.attributes",
    "product.account_code_sales", "product.account_code_purchase",
    "product.price_outlet", "product.brand_id", "product.deleted_at",
    "product.version", "product.created_at", "product.updated_at",
    "product.description", "webhook", "webhookTime", "__v", "updatedAt",
  ].map(f => `-${f}`).join(" ");

  const wishlist = await Wishlist.findOne({ user: userId })
    .populate("items", WISHLIST_PRODUCT_EXCLUDE)
    .lean();
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
