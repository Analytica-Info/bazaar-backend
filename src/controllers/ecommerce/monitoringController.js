'use strict';

const mongoose = require('mongoose');
const { getClient, isEnabled } = require('../../config/redis');
const metrics = require('../../services/metricsService');
const logger = require('../../utilities/logger');

/**
 * GET /admin/monitoring/overview
 * Returns last-hour totals, container health, and Redis status.
 */
exports.getOverview = async (req, res) => {
    try {
        const [hourTotals, recentErrors] = await Promise.all([
            metrics.getLastHourTotals(),
            metrics.getRecentErrors(20),
        ]);

        const memMB = process.memoryUsage();
        const redisReady = isEnabled() && getClient()?.status === 'ready';

        res.json({
            success: true,
            data: {
                lastHour: hourTotals,
                health: {
                    uptimeSeconds: Math.floor(process.uptime()),
                    memoryMB: {
                        rss: (memMB.rss / 1024 / 1024).toFixed(1),
                        heapUsed: (memMB.heapUsed / 1024 / 1024).toFixed(1),
                        heapTotal: (memMB.heapTotal / 1024 / 1024).toFixed(1),
                    },
                    mongoState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
                    redisState: redisReady ? 'ready' : (isEnabled() ? 'connecting' : 'disabled'),
                },
                recentErrors,
            },
        });
    } catch (err) {
        logger.error({ err }, 'monitoringController.getOverview failed');
        res.status(500).json({ success: false, message: 'Failed to fetch monitoring overview' });
    }
};

/**
 * GET /admin/monitoring/webhooks?window=120
 * Returns per-minute webhook + dedup timeline for the given window (minutes).
 */
exports.getWebhookTimeline = async (req, res) => {
    try {
        const window = Math.min(parseInt(req.query.window || '120', 10), 1440);
        const [timeline, errors] = await Promise.all([
            metrics.getWebhookTimeline(window),
            metrics.getErrorTimeline(window),
        ]);

        res.json({ success: true, data: { ...timeline, errors } });
    } catch (err) {
        logger.error({ err }, 'monitoringController.getWebhookTimeline failed');
        res.status(500).json({ success: false, message: 'Failed to fetch webhook timeline' });
    }
};

/**
 * GET /admin/monitoring/errors?limit=50
 * Returns recent error log entries from Redis.
 */
exports.getErrors = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        const errors = await metrics.getRecentErrors(limit);
        res.json({ success: true, data: errors });
    } catch (err) {
        logger.error({ err }, 'monitoringController.getErrors failed');
        res.status(500).json({ success: false, message: 'Failed to fetch errors' });
    }
};
