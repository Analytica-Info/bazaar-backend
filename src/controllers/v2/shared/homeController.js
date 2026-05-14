'use strict';

const crypto = require('crypto');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const logger = require('../../../utilities/logger');
const buildHomeManifest = require('../../../services/home/use-cases/buildHomeManifest');

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

/**
 * Compute a weak ETag from the rail versions array.
 * @param {Array<{name: string, version: string|null}>} rails
 * @returns {string} e.g. W/"abc123def456789"
 */
function computeETag(rails) {
  const payload = rails.map((r) => `${r.name}:${r.version || ''}`).join('|');
  const hash = crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
  return `W/"${hash}"`;
}

/**
 * GET /v2/home
 */
async function getHomeManifest(req, res) {
  try {
    const platform = req.platform || 'web';

    // Optional comma-separated rail filter
    const railFilter = req.query.rails
      ? req.query.rails.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    // Optional per-rail param overrides — JSON-encoded query param
    let params = {};
    if (req.query.params) {
      try {
        params = JSON.parse(req.query.params);
      } catch (parseErr) {
        logger.warn({ rawParams: req.query.params }, 'home manifest: failed to parse ?params query — ignoring');
      }
    }

    const manifest = await buildHomeManifest({ platform, rails: railFilter, params });
    const etag = computeETag(manifest.rails);

    // Conditional GET — 304 Not Modified
    if (req.headers['if-none-match'] === etag) {
      res.set('ETag', etag);
      res.set('Cache-Control', CACHE_CONTROL);
      return res.status(304).send();
    }

    res.set('ETag', etag);
    res.set('Cache-Control', CACHE_CONTROL);
    return res.status(200).json(wrap(manifest));
  } catch (err) {
    logger.error({ err }, 'home manifest: unhandled error');
    return res.status(500).json(wrapError('HOME_MANIFEST_FAILED', err.message || 'Failed to build home manifest'));
  }
}

module.exports = { getHomeManifest };
