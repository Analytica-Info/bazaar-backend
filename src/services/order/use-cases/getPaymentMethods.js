'use strict';

const { getPaymentRuntimeConfig } = require('../../payments/getPaymentRuntimeConfig');

/**
 * Return the list of payment methods available to the mobile client.
 *
 * Two-tier gate model (consistent across all three providers post-cleanup):
 * - HARD gate (env): provider credential present → "is this provisioned?"
 * - SOFT gate (DB):  admin-toggleable config flag → "is this live right now?"
 *
 * A method is only included in the response when the hard gate passes.
 * The `enabled` field reflects the soft (DB-backed) flag.
 *
 * Previously Nomod had an additional `NOMOD_ENABLED` env-flag layer that
 * duplicated the DB toggle. That flag was retired — the DB is the only
 * source of truth for the live toggle now.
 *
 * @returns {Promise<Array<{id: string, name: string, icon: string, enabled: boolean}>>}
 */
module.exports = async function getPaymentMethods() {
    const config = await getPaymentRuntimeConfig();
    const methods = [];

    // Tabby — hard gate: TABBY_AUTH_KEY must be set
    if (process.env.TABBY_AUTH_KEY) {
        methods.push({
            id: 'tabby',
            name: 'Tabby',
            icon: 'assets/icons/tabby-logo.png',
            enabled: Boolean(config.tabbyEnabled),
        });
    }

    // Stripe — hard gate: STRIPE_ENABLED !== 'false' (default: included)
    if (process.env.STRIPE_ENABLED !== 'false') {
        methods.push({
            id: 'stripe',
            name: 'Card',
            icon: 'assets/icons/online-payment.png',
            enabled: Boolean(config.stripeEnabled),
        });
    }

    // Nomod — hard gate: NOMOD_API_KEY must be set
    if (process.env.NOMOD_API_KEY) {
        methods.push({
            id: 'nomod',
            name: 'Nomod',
            icon: 'assets/icons/nomod-logo.png',
            enabled: Boolean(config.nomodEnabled),
        });
    }

    return methods;
};
