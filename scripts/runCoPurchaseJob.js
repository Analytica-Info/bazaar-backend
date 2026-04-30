#!/usr/bin/env node
'use strict';

/**
 * Standalone runner for the nightly co-purchase aggregation.
 * Wire into cron after deploy:
 *   0 3 * * *  cd /app && node scripts/runCoPurchaseJob.js >> /var/log/bazaar/recs.log 2>&1
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { run } = require('../src/services/recommendations/coPurchaseJob');
const logger = require('../src/utilities/logger');

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI not configured');
    await mongoose.connect(uri);
    try {
        await run();
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    logger.error({ module: 'recs', err }, 'Co-purchase job failed');
    process.exitCode = 1;
});
