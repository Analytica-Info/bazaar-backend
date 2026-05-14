'use strict';

const Product = require('../../../repositories').products.rawModel();

const GIFT_MIN_STOCK = 5;
const giftProductQuery = {
    isGift: true,
    $or: [
        { status: { $exists: false } },
        { status: true }
    ],
};

function normalizeCartDataWithGifts(cartData) {
    let normalizedCartData = Array.isArray(cartData) ? [...cartData] : [];
    return normalizedCartData;
}

async function applyGiftLogic(normalizedCartData) {
    const giftIndices = normalizedCartData
        .map((item, index) => (item && item.isGiftWithPurchase ? index : -1))
        .filter((i) => i >= 0);
    if (giftIndices.length > 0) {
        const giftProduct = await Product.findOne(giftProductQuery)
            .select("totalQty")
            .lean();
        const giftStock = giftProduct?.totalQty ?? 0;
        if (giftStock <= GIFT_MIN_STOCK || giftStock <= 0) {
            normalizedCartData = normalizedCartData.filter((item) => !item.isGiftWithPurchase);
        } else {
            let firstGiftKept = false;
            normalizedCartData = normalizedCartData.filter((item) => {
                if (!item.isGiftWithPurchase) return true;
                if (!firstGiftKept) {
                    firstGiftKept = true;
                    item.price = 0;
                    item.amount = 0;
                    return true;
                }
                return false;
            });
        }
    }
    return normalizedCartData;
}

module.exports = { normalizeCartDataWithGifts, applyGiftLogic };
