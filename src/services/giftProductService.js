const Product = require('../repositories').products.rawModel();
const { GIFT_THRESHOLD_DEFAULT_AED } = require('../config/constants/business');

/**
 * Set a product (and optionally a specific variant) as the gift product.
 * Clears all existing gift flags first, then sets the new one.
 * @returns {Object} The updated product document.
 */
async function setGiftProduct({ productId, variantId, giftThreshold }) {
    if (!productId) {
        throw { status: 400, message: 'productId is required' };
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
        throw { status: 404, message: 'Product not found' };
    }

    const variants = Array.isArray(product.variantsData) ? product.variantsData : [];

    let resolvedVariantId = null;
    if (variantId && variants.length > 0) {
        const variant = variants.find(v => v.id === variantId || v.id === String(variantId));
        if (!variant) {
            throw { status: 400, message: 'Selected variant not found in this product.' };
        }
        const qty = Number(variant.qty);
        if (qty < 1) {
            throw { status: 400, message: 'Selected variant must have quantity at least 1 to be set as gift.' };
        }
        resolvedVariantId = variant.id;
    } else if (variants.length > 0) {
        const firstWithStock = variants.find(v => Number(v.qty) >= 1);
        resolvedVariantId = firstWithStock ? firstWithStock.id : null;
    }

    const threshold = giftThreshold != null && giftThreshold !== '' ? Number(giftThreshold) : GIFT_THRESHOLD_DEFAULT_AED;
    if (Number.isNaN(threshold) || threshold < 0) {
        throw { status: 400, message: 'Gift threshold must be a valid number (AED) >= 0.' };
    }

    // Clear all existing gift flags
    await Product.updateMany({}, { $set: { isGift: false, giftVariantId: null } });

    // Set the new gift product
    const updated = await Product.findByIdAndUpdate(
        productId,
        { $set: { isGift: true, giftVariantId: resolvedVariantId, giftThreshold: threshold } },
        { new: true }
    ).lean();

    return updated;
}

/**
 * Get the current gift product.
 * @returns {Object|null} The gift product or null if none is set.
 */
async function getGiftProduct() {
    const giftProduct = await Product.findOne({ isGift: true }).lean();
    return giftProduct || null;
}

module.exports = {
    setGiftProduct,
    getGiftProduct,
};
