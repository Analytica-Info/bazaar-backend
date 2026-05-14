'use strict';

/**
 * v2 Rail controller — shared (mobile + web).
 *
 * Single parameterised endpoint that delegates to the registered rail fetchers.
 * Do NOT modify the rail registry or any rail file — this controller wraps them.
 *
 * Rails whose fetch() ignores ctx.params (fixed-result rails):
 *   today-deal, top-rated, favourites-of-week, categories
 * These rails will be served but page/limit overrides have no effect.
 */

const { wrap, wrapError } = require('../_shared/responseEnvelope');
const registry = require('../../../services/home/registry');
const logger = require('../../../utilities/logger');

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

/**
 * GET /v2/rails/:railName
 * Query: page, limit, categoryId (for categories-product), and any other
 *        params a rail's defaultParams supports.
 */
async function getRail(req, res) {
  const { railName } = req.params;
  const registration = registry.resolve(railName);

  if (!registration) {
    return res.status(404).json(wrapError('UNKNOWN_RAIL', `Rail "${railName}" is not registered`));
  }

  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || (registration.defaultParams.limit || 10);

    // Only forward query params whose keys exist in the rail's defaultParams.
    // This prevents arbitrary query params leaking into rail use-cases.
    const allowedExtras = Object.keys(registration.defaultParams).filter(
      (k) => k !== 'page' && k !== 'limit'
    );
    const extraOverrides = {};
    for (const key of allowedExtras) {
      if (req.query[key] !== undefined) {
        extraOverrides[key] = req.query[key];
      }
    }

    const ctx = { params: { page, limit, ...extraOverrides } };
    const data = await registration.fetch(ctx);

    res.set('Cache-Control', CACHE_CONTROL);
    return res.status(200).json(wrap({ railName, page, limit, ...data }, `Rail "${railName}" fetched successfully`));
  } catch (err) {
    logger.error({ err, railName }, 'v2 getRail: unhandled error');
    const status = err.status || 500;
    return res.status(status).json(wrapError('RAIL_FETCH_FAILED', err.message || `Failed to fetch rail "${railName}"`));
  }
}

module.exports = { getRail };
