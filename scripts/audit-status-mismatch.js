#!/usr/bin/env node
/* Read-only audit: count products plausibly affected by the status-leak bug. */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Product = mongoose.connection.db.collection('products');
  const total = await Product.countDocuments({});
  const statusTrue = await Product.countDocuments({ status: true });
  const byWebhookAffected = await Product.countDocuments({
    status: true,
    webhook: { $in: ['updateParkedDetails', 'api', 'updateProductDiscounts'] },
  });
  const parkedDriven = await Product.countDocuments({ webhook: 'updateParkedDetails', status: true });
  const apiRefreshDriven = await Product.countDocuments({ webhook: 'api', status: true });

  console.log('Audit — products possibly affected by status-leak bug:');
  console.log({
    totalProducts: total,
    statusTrue: statusTrue,
    statusTrue_writtenByBuggyPath: byWebhookAffected,
    breakdown: {
      'webhook=updateParkedDetails (cron)': parkedDriven,
      'webhook=api (admin refresh)': apiRefreshDriven,
    },
    note: 'These counts are upper bounds — discount sync clobbers webhook field, hiding true authorship. Per-product LS 2.0 lookup needed for definitive list.',
  });
  await mongoose.disconnect();
})().catch((e) => { console.error(e?.stack || e?.message || e); process.exit(1); });
