const Product = require("../models/Product");

const eligibleDiscountProductFilter = {
  $or: [{ status: { $exists: false } }, { status: true }],
  totalQty: { $gt: 0 },
};

function calculateDiscount(product) {
  const originalPrice = Math.round(
    product.product?.price_standard?.tax_inclusive / 0.65
  );
  let discount = 0;
  if (product.variantsData && product.variantsData.length > 0) {
    product.variantsData.forEach((variant) => {
      const discountPercentage = Math.round(
        ((originalPrice - variant.price) / originalPrice) * 100
      );
      if (discountPercentage > discount) {
        discount = discountPercentage;
      }
    });
  }
  return discount;
}

function computeProductDiscountFields(product) {
  const discount = calculateDiscount(product);
  const originalPrice = Number(
    (product.product?.price_standard?.tax_inclusive / 0.65).toFixed(2)
  );

  let highestDiscountPercentage = 0;
  let highestDiscountVariant = null;
  if (product.variantsData && product.variantsData.length > 0) {
    product.variantsData.forEach((variant) => {
      const discountPercentage = Number(
        (((originalPrice - variant.price) / originalPrice) * 100).toFixed(2)
      );
      if (discountPercentage > highestDiscountPercentage) {
        highestDiscountPercentage = discountPercentage;
        highestDiscountVariant = variant;
      }
    });
  }

  return {
    discount,
    originalPrice,
    discountedPrice: highestDiscountVariant?.price,
  };
}

async function syncDiscountFieldsForParentIds(
  parentProductIds,
  webhook,
  webhookTime
) {
  const idSet = new Set((parentProductIds || []).filter(Boolean));
  if (idSet.size === 0) {
    return { bulkWriteCount: 0, syncedParentIds: [], skippedParentIds: [] };
  }

  const products = await Product.find(eligibleDiscountProductFilter).lean();
  const enriched = products.map((p) => ({
    ...p,
    ...computeProductDiscountFields(p),
  }));
  const maxDiscount = Math.max(0, ...enriched.map((p) => p.discount || 0));
  const syncedParentIds = new Set();
  const bulkOps = enriched.map((p) => {
    const isTarget = idSet.has(p.product?.id);
    if (isTarget) syncedParentIds.add(p.product.id);
    const $set = { isHighest: p.discount === maxDiscount };
    if (isTarget) {
      Object.assign($set, {
        discount: p.discount,
        originalPrice: p.originalPrice,
        discountedPrice: p.discountedPrice,
        webhook,
        webhookTime,
      });
    }
    return {
      updateOne: {
        filter: { _id: p._id },
        update: { $set },
      },
    };
  });

  const skippedParentIds = [...idSet].filter((id) => !syncedParentIds.has(id));

  if (bulkOps.length) {
    await Product.bulkWrite(bulkOps);
  }
  return {
    bulkWriteCount: bulkOps.length,
    syncedParentIds: [...syncedParentIds],
    skippedParentIds,
  };
}

async function applyDiscountFieldsForParentProductId(
  parentProductId,
  webhook,
  webhookTime
) {
  return syncDiscountFieldsForParentIds([parentProductId], webhook, webhookTime);
}

module.exports = {
  eligibleDiscountProductFilter,
  calculateDiscount,
  computeProductDiscountFields,
  syncDiscountFieldsForParentIds,
  applyDiscountFieldsForParentProductId,
};
