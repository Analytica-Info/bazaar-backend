#!/usr/bin/env node
'use strict';

/**
 * Standalone runner for the embedding pipeline. Idempotent: only re-embeds
 * products whose source text hash changed.
 *   0 4 * * * cd /app && node scripts/runEmbeddingJob.js >> /var/log/bazaar/embed.log 2>&1
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { runEmbeddingJob } = require('../src/services/recommendations/embeddingService');
const logger = require('../src/utilities/logger');

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI not configured');
    await mongoose.connect(uri);
    try {
        await runEmbeddingJob();
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    logger.error({ module: 'recs-embed', err }, 'Embedding job failed');
    process.exitCode = 1;
});
