'use strict';

const Product = require('../../../repositories').products.rawModel();

const GIFT_THRESHOLD_DEFAULT_AED = 400;
const GIFT_MIN_STOCK = 5;

async function getGiftProductInfo() {
  const giftProduct = await Product.findOne({
    isGift: true,
    $or: [{ status: { $exists: false } }, { status: true }],
  })
    .select('totalQty product variantsData _id giftVariantId giftThreshold')
    .lean();

  if (!giftProduct) return null;

  const giftStock = giftProduct.totalQty ?? 0;
  const threshold =
    giftProduct.giftThreshold != null
      ? Number(giftProduct.giftThreshold)
      : GIFT_THRESHOLD_DEFAULT_AED;

  return {
    product: giftProduct,
    stock: giftStock,
    inStock: giftStock >= GIFT_MIN_STOCK,
    threshold,
    id: giftProduct._id?.toString() || '',
  };
}

module.exports = { getGiftProductInfo, GIFT_THRESHOLD_DEFAULT_AED };
