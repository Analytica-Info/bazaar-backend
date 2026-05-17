'use strict';

const cache = require('../../utilities/cache');
const repos = require('../../repositories');

const CACHE_KEY = 'payment-method-config:v1';
const CACHE_TTL = 30; // seconds

/**
 * Fetch the runtime payment-method config (`paymentMethodConfig` singleton),
 * with a 30-second Redis cache.
 *
 * This is the canonical source of truth for "which payment providers are
 * live right now." Earlier paths had a separate env-flag layer
 * (`NOMOD_ENABLED`) that duplicated this DB toggle; that env flag has been
 * retired in favour of the admin-toggleable DB config. Provisioning
 * concerns (is the credential present?) still live in env vars
 * (`NOMOD_API_KEY`, `TABBY_AUTH_KEY`, `STRIPE_SK`); only the *live toggle*
 * lives in the DB.
 *
 * Auto-creates the singleton document if it does not yet exist (via
 * `repos.paymentMethodConfig.getSingleton()`).
 *
 * @returns {Promise<{stripeEnabled: boolean, tabbyEnabled: boolean, nomodEnabled: boolean}>}
 */
async function getPaymentRuntimeConfig() {
    return cache.getOrSet(CACHE_KEY, CACHE_TTL, () =>
        repos.paymentMethodConfig.getSingleton()
    );
}

module.exports = { getPaymentRuntimeConfig };
