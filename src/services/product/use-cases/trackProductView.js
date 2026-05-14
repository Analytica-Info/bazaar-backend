'use strict';

const ProductView = require('../../../repositories').productViews.rawModel();
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

async function trackProductView(productId, userId = null) {
  try {
    const filter = { product_id: productId, user_id: userId };
    const existingView = await ProductView.findOne(filter);

    if (!existingView) {
      await ProductView.create({
        product_id: productId,
        user_id: userId,
        views: 1,
        lastViewedAt: clock.now(),
      });
    } else {
      await ProductView.updateOne(filter, {
        $inc: { views: 1 },
        $set: { lastViewedAt: clock.now() },
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error tracking product view:');
  }
}

module.exports = { trackProductView };
