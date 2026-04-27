'use strict';

/**
 * Lightweight Redis-backed metrics collector.
 *
 * All writes use INCR + EXPIRE so they are atomic and safe under concurrency.
 * All reads scan only the metrics: namespace — no impact on cache keys.
 * Every method degrades gracefully when Redis is unavailable.
 *
 * Key schema (all prefixed with bazaar: by the cache utility):
 *   metrics:webhook:<type>:<YYYY-MM-DDTHH:MM>        → INCR  (TTL 3h)
 *   metrics:dedup:<type>:<YYYY-MM-DDTHH:MM>           → INCR  (TTL 3h)
 *   metrics:errors:<YYYY-MM-DDTHH:MM>                 → INCR  (TTL 3h)
 *   metrics:error-log                                 → Redis LIST, capped at 200 entries
 *   metrics:req:<source>:<YYYY-MM-DDTHH:MM>           → INCR  (TTL 3h)  sources: user-api|admin-api|webhook
 *   metrics:discount-sync:<YYYY-MM-DDTHH:MM>          → INCR  (TTL 3h)  count of syncs triggered
 *   metrics:discount-sync-docs:<YYYY-MM-DDTHH:MM>     → INCRBY productCount (TTL 3h)
 */

const { getClient, isEnabled } = require('../config/redis');
const logger = require('../utilities/logger');

const NAMESPACE = 'bazaar:';
const COUNTER_TTL = 60 * 60 * 3; // 3 hours
const ERROR_LOG_KEY = `${NAMESPACE}metrics:error-log`;
const ERROR_LOG_CAP = 200;

function currentMinute() {
    const now = new Date();
    return now.toISOString().slice(0, 16); // e.g. "2026-04-27T15:42"
}

async function incr(key) {
    if (!isEnabled()) return;
    const client = getClient();
    if (!client) return;
    try {
        const fullKey = `${NAMESPACE}${key}`;
        const val = await client.incr(fullKey);
        if (val === 1) await client.expire(fullKey, COUNTER_TTL);
    } catch (err) {
        logger.warn({ module: 'metrics', key, err }, 'metrics incr failed');
    }
}

// ---------------------------------------------------------------------------
// Record events (called from service layer)
// ---------------------------------------------------------------------------

async function recordWebhook(type) {
    await incr(`metrics:webhook:${type}:${currentMinute()}`);
}

async function recordDedup(type) {
    await incr(`metrics:dedup:${type}:${currentMinute()}`);
}

async function recordError(context, message) {
    await incr(`metrics:errors:${currentMinute()}`);

    const client = getClient();
    if (!client || !isEnabled()) return;
    try {
        const entry = JSON.stringify({
            t: new Date().toISOString(),
            ctx: context,
            msg: message,
        });
        await client.lpush(ERROR_LOG_KEY, entry);
        await client.ltrim(ERROR_LOG_KEY, 0, ERROR_LOG_CAP - 1);
        await client.expire(ERROR_LOG_KEY, 60 * 60 * 24); // 24h
    } catch (err) {
        logger.warn({ module: 'metrics', err }, 'metrics error-log push failed');
    }
}

// ---------------------------------------------------------------------------
// Read aggregated data (called from monitoring controller)
// ---------------------------------------------------------------------------

/**
 * Returns per-minute webhook and dedup counts for the last `windowMinutes`.
 * Shape: { minutes: string[], series: { [type]: number[] }, dedup: { [type]: number[] } }
 */
async function getWebhookTimeline(windowMinutes = 120) {
    const client = getClient();
    if (!client || !isEnabled()) return { minutes: [], series: {}, dedup: {} };

    try {
        const now = new Date();
        const minutes = [];
        for (let i = windowMinutes - 1; i >= 0; i--) {
            const d = new Date(now - i * 60 * 1000);
            minutes.push(d.toISOString().slice(0, 16));
        }

        const types = ['product-update', 'inventory-update', 'sale-update'];
        const series = {};
        const dedup = {};

        for (const type of types) {
            const webhookKeys = minutes.map(m => `${NAMESPACE}metrics:webhook:${type}:${m}`);
            const dedupKeys = minutes.map(m => `${NAMESPACE}metrics:dedup:${type}:${m}`);

            const [wVals, dVals] = await Promise.all([
                client.mget(...webhookKeys),
                client.mget(...dedupKeys),
            ]);

            series[type] = wVals.map(v => parseInt(v || '0', 10));
            dedup[type] = dVals.map(v => parseInt(v || '0', 10));
        }

        return { minutes, series, dedup };
    } catch (err) {
        logger.warn({ module: 'metrics', err }, 'getWebhookTimeline failed');
        return { minutes: [], series: {}, dedup: {} };
    }
}

/**
 * Returns per-minute error counts for the last `windowMinutes`.
 */
async function getErrorTimeline(windowMinutes = 120) {
    const client = getClient();
    if (!client || !isEnabled()) return { minutes: [], counts: [] };

    try {
        const now = new Date();
        const minutes = [];
        for (let i = windowMinutes - 1; i >= 0; i--) {
            const d = new Date(now - i * 60 * 1000);
            minutes.push(d.toISOString().slice(0, 16));
        }

        const keys = minutes.map(m => `${NAMESPACE}metrics:errors:${m}`);
        const vals = await client.mget(...keys);
        return { minutes, counts: vals.map(v => parseInt(v || '0', 10)) };
    } catch (err) {
        logger.warn({ module: 'metrics', err }, 'getErrorTimeline failed');
        return { minutes: [], counts: [] };
    }
}

/**
 * Returns the most recent error log entries (newest first).
 */
async function getRecentErrors(limit = 50) {
    const client = getClient();
    if (!client || !isEnabled()) return [];

    try {
        const raw = await client.lrange(ERROR_LOG_KEY, 0, limit - 1);
        return raw.map(r => {
            try { return JSON.parse(r); } catch { return { t: '', ctx: '', msg: r }; }
        });
    } catch (err) {
        logger.warn({ module: 'metrics', err }, 'getRecentErrors failed');
        return [];
    }
}

/**
 * Aggregated totals for the last hour.
 */
async function getLastHourTotals() {
    const { minutes, series, dedup } = await getWebhookTimeline(60);
    const { counts: errorCounts } = await getErrorTimeline(60);

    const sum = arr => arr.reduce((a, b) => a + b, 0);

    const totalWebhooks = Object.values(series).reduce((acc, arr) => acc + sum(arr), 0);
    const totalDedup = Object.values(dedup).reduce((acc, arr) => acc + sum(arr), 0);
    const totalErrors = sum(errorCounts);

    // Peak minute detection
    const combinedPerMinute = minutes.map((_, i) =>
        Object.values(series).reduce((acc, arr) => acc + (arr[i] || 0), 0)
    );
    const peak = Math.max(...combinedPerMinute, 0);
    const peakMinute = combinedPerMinute.indexOf(peak) >= 0
        ? minutes[combinedPerMinute.indexOf(peak)]
        : null;

    const dedupRate = totalWebhooks > 0
        ? ((totalDedup / (totalWebhooks + totalDedup)) * 100).toFixed(1)
        : '0.0';

    return { totalWebhooks, totalDedup, totalErrors, peak, peakMinute, dedupRate };
}

// ---------------------------------------------------------------------------
// Request source tracking (user-api, admin-api, webhook)
// ---------------------------------------------------------------------------

async function recordRequest(source) {
    await incr(`metrics:req:${source}:${currentMinute()}`);
}

async function getRequestTimeline(windowMinutes = 120) {
    const client = getClient();
    if (!client || !isEnabled()) return { minutes: [], series: {} };

    try {
        const now = new Date();
        const minutes = [];
        for (let i = windowMinutes - 1; i >= 0; i--) {
            const d = new Date(now - i * 60 * 1000);
            minutes.push(d.toISOString().slice(0, 16));
        }

        const sources = ['user-api', 'admin-api', 'webhook'];
        const series = {};

        for (const src of sources) {
            const keys = minutes.map(m => `${NAMESPACE}metrics:req:${src}:${m}`);
            const vals = await client.mget(...keys);
            series[src] = vals.map(v => parseInt(v || '0', 10));
        }

        return { minutes, series };
    } catch (err) {
        logger.warn({ module: 'metrics', err }, 'getRequestTimeline failed');
        return { minutes: [], series: {} };
    }
}

// ---------------------------------------------------------------------------
// Discount sync impact tracking
// ---------------------------------------------------------------------------

async function recordDiscountSync(productCount) {
    const min = currentMinute();
    await incr(`metrics:discount-sync:${min}`);
    if (!isEnabled()) return;
    const client = getClient();
    if (!client) return;
    try {
        const docsKey = `${NAMESPACE}metrics:discount-sync-docs:${min}`;
        const val = await client.incrby(docsKey, productCount);
        if (val === productCount) await client.expire(docsKey, COUNTER_TTL);
    } catch (err) {
        logger.warn({ module: 'metrics', err }, 'recordDiscountSync docs failed');
    }
}

async function getDiscountSyncTimeline(windowMinutes = 120) {
    const client = getClient();
    if (!client || !isEnabled()) return { minutes: [], syncs: [], docs: [] };

    try {
        const now = new Date();
        const minutes = [];
        for (let i = windowMinutes - 1; i >= 0; i--) {
            const d = new Date(now - i * 60 * 1000);
            minutes.push(d.toISOString().slice(0, 16));
        }

        const syncKeys = minutes.map(m => `${NAMESPACE}metrics:discount-sync:${m}`);
        const docsKeys = minutes.map(m => `${NAMESPACE}metrics:discount-sync-docs:${m}`);

        const [syncVals, docsVals] = await Promise.all([
            client.mget(...syncKeys),
            client.mget(...docsKeys),
        ]);

        return {
            minutes,
            syncs: syncVals.map(v => parseInt(v || '0', 10)),
            docs: docsVals.map(v => parseInt(v || '0', 10)),
        };
    } catch (err) {
        logger.warn({ module: 'metrics', err }, 'getDiscountSyncTimeline failed');
        return { minutes: [], syncs: [], docs: [] };
    }
}

module.exports = {
    recordWebhook,
    recordDedup,
    recordError,
    recordRequest,
    recordDiscountSync,
    getWebhookTimeline,
    getErrorTimeline,
    getRecentErrors,
    getLastHourTotals,
    getRequestTimeline,
    getDiscountSyncTimeline,
};
