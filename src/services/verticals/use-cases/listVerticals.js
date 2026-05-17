'use strict';

const cache = require('../../../utilities/cache');
const repos = require('../../../repositories');

const CACHE_KEY = 'catalog:verticals:v1';
const CACHE_TTL = 300; // 5 minutes

const UAE_ENTRY = Object.freeze({
    id: 'uae',
    label: 'UAE',
    tag: 'Default',
    enabled: true,
    comingSoon: false,
});

/**
 * Return all verticals, with UAE pinned first.
 * Cached for 5 minutes.
 *
 * @returns {Promise<Array>}
 */
async function listVerticals() {
    const verticals = await cache.getOrSet(CACHE_KEY, CACHE_TTL, async () => {
        const dbRows = await repos.verticals.findAll();

        // Remove uae from db rows if somehow present, always prepend the static entry.
        const rest = dbRows.filter((v) => v.id !== 'uae').map((v) => ({
            id: v.id,
            label: v.label,
            tag: v.tag || null,
            enabled: v.enabled,
            comingSoon: v.comingSoon,
            ...(v.launchDate ? { launchDate: v.launchDate } : {}),
        }));

        return [{ ...UAE_ENTRY }, ...rest];
    });

    return verticals || [];
}

module.exports = { listVerticals };
