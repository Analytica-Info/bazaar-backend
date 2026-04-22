const cartAggregateService = require("../../../services/v2/cartAggregateService");
const logger = require("../../../utilities/logger");

/**
 * GET /api/v2/cart/summary
 *
 * Requires authentication (reuses the standard mobile authMiddleware).
 * Returns cart items, price breakdown, free-shipping progress,
 * available coupons, and any active bank promos in one call.
 */
exports.getSummary = async (req, res) => {
  try {
    const data = await cartAggregateService.getCartSummary({
      user: req.user,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error({ err: error }, "v2 getCartSummary failed");
    res
      .status(500)
      .json({ success: false, message: "Failed to load cart" });
  }
};
