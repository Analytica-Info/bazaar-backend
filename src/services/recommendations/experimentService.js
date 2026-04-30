'use strict';

/**
 * Phase 4 — deterministic variant assignment + metrics aggregation.
 *
 * Assignment:
 *   sha256(`${userId || sessionId}:${experimentKey}`) → first 8 hex → [0,1)
 *   pick variant whose cumulative weight covers the bucket.
 *
 * Metrics:
 *   Aggregate RecommendationEvent docs by recSource × experimentVariant ×
 *   eventType to compute CTR (click/impression), ATC rate, conversion rate.
 */

const crypto = require('crypto');
const Experiment = require('../../models/Experiment');
const repos = require('../../repositories');

function bucketFor(subject, key) {
    const hex = crypto
        .createHash('sha256')
        .update(`${subject}:${key}`)
        .digest('hex')
        .slice(0, 8);
    return parseInt(hex, 16) / 0xffffffff;
}

async function assign({ key, userId, sessionId }) {
    const exp = await Experiment.findOne({ key, status: 'running' }).lean();
    if (!exp) return null;
    const subject = String(userId || sessionId || 'anon');
    const bucket = bucketFor(subject, key);
    let acc = 0;
    for (const v of exp.variants) {
        acc += v.weight;
        if (bucket < acc) return { key, variant: v.name, config: v.config };
    }
    const last = exp.variants[exp.variants.length - 1];
    return { key, variant: last?.name || 'control', config: last?.config || {} };
}

async function metrics({ key, since }) {
    const Event = repos.recommendationEvents.model;
    const match = { createdAt: { $gte: since || new Date(Date.now() - 7 * 86400000) } };
    if (key) match.experimentVariant = { $exists: true, $ne: null };

    const rows = await Event.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    recSource: '$recSource',
                    variant: '$experimentVariant',
                    eventType: '$eventType',
                },
                count: { $sum: 1 },
                users: { $addToSet: '$userId' },
            },
        },
    ]);

    const byKey = new Map();
    for (const r of rows) {
        const k = `${r._id.recSource}|${r._id.variant || 'none'}`;
        const entry = byKey.get(k) || {
            recSource: r._id.recSource,
            variant: r._id.variant || 'none',
            impressions: 0,
            clicks: 0,
            addToCart: 0,
            purchase: 0,
            users: new Set(),
        };
        if (r._id.eventType === 'impression') entry.impressions += r.count;
        if (r._id.eventType === 'click') entry.clicks += r.count;
        if (r._id.eventType === 'add_to_cart') entry.addToCart += r.count;
        if (r._id.eventType === 'purchase') entry.purchase += r.count;
        for (const u of r.users) entry.users.add(String(u));
        byKey.set(k, entry);
    }

    return [...byKey.values()].map((e) => ({
        recSource: e.recSource,
        variant: e.variant,
        impressions: e.impressions,
        clicks: e.clicks,
        addToCart: e.addToCart,
        purchase: e.purchase,
        ctr: e.impressions ? e.clicks / e.impressions : 0,
        atcRate: e.impressions ? e.addToCart / e.impressions : 0,
        cvr: e.impressions ? e.purchase / e.impressions : 0,
        uniqueUsers: e.users.size,
    }));
}

module.exports = { assign, metrics, bucketFor };
