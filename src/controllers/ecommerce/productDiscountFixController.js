const Product = require("../../models/Product");
const {
  syncDiscountFieldsForParentIds,
} = require("../../helpers/productDiscountSync");

const WEBHOOK_PRODUCT_UPDATE = "product.update";
const WEBHOOK_AFTER_SYNC = "updateProductDiscounts";

exports.getProductsWithProductUpdateWebhook = async (req, res) => {
  try {
    const products = await Product.find({ webhook: WEBHOOK_PRODUCT_UPDATE })
      .select(
        "_id product.id product.name totalQty status discount originalPrice discountedPrice isHighest webhook webhookTime"
      )
      .lean();

    return res.status(200).json({
      success: true,
      count: products.length,
      webhook: WEBHOOK_PRODUCT_UPDATE,
      products,
    });
  } catch (err) {
    console.error("[getProductsWithProductUpdateWebhook]", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

exports.syncProductUpdateWebhookDiscounts = async (req, res) => {
  try {
    const rows = await Product.find({ webhook: WEBHOOK_PRODUCT_UPDATE })
      .select("product.id")
      .lean();

    const parentIds = [
      ...new Set(rows.map((r) => r.product?.id).filter(Boolean)),
    ];

    const webhookTime = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Dubai",
      hour12: true,
    });

    for (const pid of parentIds) {
      console.log("product id next updated:", pid);
    }

    const result = await syncDiscountFieldsForParentIds(
      parentIds,
      WEBHOOK_AFTER_SYNC,
      webhookTime
    );

    return res.status(200).json({
      success: true,
      message: "Discount fields synced (cron logic).",
      distinctParentIds: parentIds.length,
      syncedParentIds: result.syncedParentIds,
      skippedNotEligible: result.skippedParentIds,
      bulkWriteOperations: result.bulkWriteCount,
    });
  } catch (err) {
    console.error("[syncProductUpdateWebhookDiscounts]", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};
