const checkoutPrepareService = require("../../../services/v2/checkoutPrepareService");
const logger = require("../../../utilities/logger");

/**
 * GET /api/v2/checkout/prepare
 * Returns cart summary + saved addresses + available payment methods.
 */
exports.prepare = async (req, res) => {
  try {
    const data = await checkoutPrepareService.prepare({ user: req.user });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error({ err: error }, "v2 checkout prepare failed");
    res
      .status(500)
      .json({ success: false, message: "Failed to load checkout" });
  }
};
