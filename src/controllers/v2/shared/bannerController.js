'use strict';

const { wrap, wrapError } = require('../_shared/responseEnvelope');
const bannerService = require('../../../services/bannerService');
const logger = require('../../../utilities/logger');

/**
 * GET /v2/banners
 * Returns all banners, sorted by most recently created first.
 * Public, no auth required.
 */
exports.getBanners = async (req, res) => {
    try {
        const banners = await bannerService.getAllBanners();
        return res.status(200).json(wrap({ banners }, 'Banners fetched successfully'));
    } catch (err) {
        logger.error({ err }, 'v2 getBanners failed');
        return res.status(err.status || 500).json(
            wrapError('BANNERS_FETCH_FAILED', err.message || 'Failed to fetch banners')
        );
    }
};
