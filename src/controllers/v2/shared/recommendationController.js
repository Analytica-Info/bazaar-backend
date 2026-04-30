'use strict';

/**
 * V2 Shared Recommendations Controller (Phase 1).
 * Surfaces: trending, similar, frequently-bought, for-you, event ingest.
 */

const recommendationService = require('../../../services/recommendations/recommendationService');
const { wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');
const { REC_EVENT_TYPES, REC_SOURCES } = require('../../../models/RecommendationEvent');

exports.trending = async (req, res) => {
    try {
        const result = await recommendationService.getTrending({
            category: req.query.category,
            region: req.query.region,
            limit: req.query.limit,
        });
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.similar = async (req, res) => {
    try {
        const result = await recommendationService.getSimilar(req.params.productId, {
            limit: req.query.limit,
        });
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.frequentlyBought = async (req, res) => {
    try {
        const result = await recommendationService.getFrequentlyBought(req.params.productId, {
            limit: req.query.limit,
        });
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.forYou = async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const result = await recommendationService.getForYou(userId, {
            limit: req.query.limit,
        });
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.logEvents = async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const platform = req.platform || null;
        const raw = Array.isArray(req.body?.events) ? req.body.events : [];
        const sanitized = raw
            .filter((e) => e && REC_EVENT_TYPES.includes(e.eventType) && REC_SOURCES.includes(e.recSource) && e.productId)
            .slice(0, 100)
            .map((e) => ({
                userId,
                sessionId: e.sessionId || null,
                productId: String(e.productId),
                eventType: e.eventType,
                recSource: e.recSource,
                recId: e.recId || null,
                anchorProductId: e.anchorProductId || null,
                position: Number.isFinite(Number(e.position)) ? Number(e.position) : null,
                platform,
                experimentVariant: e.experimentVariant || null,
            }));

        const result = await recommendationService.logEvents(sanitized);
        return res.status(202).json(wrap({ accepted: result.inserted, dropped: raw.length - result.inserted }));
    } catch (error) {
        return handleError(res, error);
    }
};
