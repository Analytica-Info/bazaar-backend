'use strict';

/**
 * Tests for src/services/order/use-cases/getPaymentMethods.js
 *
 * Strategy: mock repos and cache at module boundary, then manipulate
 * process.env and config mock return values per test.
 */

const mockGetSingleton = jest.fn();

jest.mock('../../../src/repositories', () => ({
    paymentMethodConfig: {
        getSingleton: (...args) => mockGetSingleton(...args),
    },
}));

// cache.getOrSet delegates directly to the fetcher so no Redis is needed
jest.mock('../../../src/utilities/cache', () => ({
    getOrSet: jest.fn(async (_key, _ttl, fetcher) => fetcher()),
    del: jest.fn().mockResolvedValue(1),
}));

// Require AFTER mocks are set up
const getPaymentMethods = require('../../../src/services/order/use-cases/getPaymentMethods');

// Preserve original env values
const SAVED_ENV = {
    TABBY_AUTH_KEY: process.env.TABBY_AUTH_KEY,
    NOMOD_API_KEY: process.env.NOMOD_API_KEY,
    NOMOD_ENABLED: process.env.NOMOD_ENABLED,
    STRIPE_ENABLED: process.env.STRIPE_ENABLED,
};

function restoreEnv() {
    for (const [k, v] of Object.entries(SAVED_ENV)) {
        if (v === undefined) {
            delete process.env[k];
        } else {
            process.env[k] = v;
        }
    }
}

beforeEach(() => {
    jest.clearAllMocks();
    // All providers provisioned
    process.env.TABBY_AUTH_KEY = 'test_tabby_key';
    process.env.NOMOD_API_KEY = 'test_nomod_key';
    process.env.NOMOD_ENABLED = 'true';
    delete process.env.STRIPE_ENABLED;

    // Default: all runtime flags on
    mockGetSingleton.mockResolvedValue({
        _id: 'singleton',
        stripeEnabled: true,
        tabbyEnabled: true,
        nomodEnabled: true,
    });
});

afterEach(restoreEnv);

describe('getPaymentMethods — runtime flag values', () => {
    test('returns enabled:true for all methods when config enables them all', async () => {
        const methods = await getPaymentMethods();
        const byId = Object.fromEntries(methods.map((m) => [m.id, m]));
        expect(byId.stripe.enabled).toBe(true);
        expect(byId.tabby.enabled).toBe(true);
        expect(byId.nomod.enabled).toBe(true);
    });

    test('returns enabled:false for stripe when config.stripeEnabled is false', async () => {
        mockGetSingleton.mockResolvedValue({
            _id: 'singleton',
            stripeEnabled: false,
            tabbyEnabled: true,
            nomodEnabled: true,
        });
        const methods = await getPaymentMethods();
        const stripe = methods.find((m) => m.id === 'stripe');
        expect(stripe).toBeDefined();
        expect(stripe.enabled).toBe(false);
    });

    test('returns enabled:false for tabby when config.tabbyEnabled is false', async () => {
        mockGetSingleton.mockResolvedValue({
            _id: 'singleton',
            stripeEnabled: true,
            tabbyEnabled: false,
            nomodEnabled: true,
        });
        const methods = await getPaymentMethods();
        const tabby = methods.find((m) => m.id === 'tabby');
        expect(tabby).toBeDefined();
        expect(tabby.enabled).toBe(false);
    });

    test('returns enabled:false for nomod when config.nomodEnabled is false', async () => {
        mockGetSingleton.mockResolvedValue({
            _id: 'singleton',
            stripeEnabled: true,
            tabbyEnabled: true,
            nomodEnabled: false,
        });
        const methods = await getPaymentMethods();
        const nomod = methods.find((m) => m.id === 'nomod');
        expect(nomod).toBeDefined();
        expect(nomod.enabled).toBe(false);
    });
});

describe('getPaymentMethods — env hard gates', () => {
    test('tabby NOT included when TABBY_AUTH_KEY is unset, regardless of config.tabbyEnabled', async () => {
        delete process.env.TABBY_AUTH_KEY;
        const methods = await getPaymentMethods();
        expect(methods.find((m) => m.id === 'tabby')).toBeUndefined();
    });

    test('nomod NOT included when NOMOD_API_KEY is unset', async () => {
        delete process.env.NOMOD_API_KEY;
        const methods = await getPaymentMethods();
        expect(methods.find((m) => m.id === 'nomod')).toBeUndefined();
    });

    test('nomod entry.enabled is false when DB config.nomodEnabled is false (DB is the live toggle)', async () => {
        // The NOMOD_ENABLED env flag was retired (see api-changelog 2026-05-17).
        // Nomod's live toggle is now the DB-backed paymentMethodConfig.nomodEnabled.
        // The env credential NOMOD_API_KEY is still the provisioning gate, but no
        // longer the live toggle — Nomod always APPEARS in the list when the API
        // key is set, but its `enabled` flag reflects the DB toggle.
        mockGetSingleton.mockResolvedValue({ stripeEnabled: true, tabbyEnabled: true, nomodEnabled: false });
        const methods = await getPaymentMethods();
        const nomod = methods.find((m) => m.id === 'nomod');
        expect(nomod).toBeDefined();
        expect(nomod.enabled).toBe(false);
    });

    test('stripe NOT included when STRIPE_ENABLED="false"', async () => {
        process.env.STRIPE_ENABLED = 'false';
        const methods = await getPaymentMethods();
        expect(methods.find((m) => m.id === 'stripe')).toBeUndefined();
    });

    test('stripe included when STRIPE_ENABLED is not set', async () => {
        delete process.env.STRIPE_ENABLED;
        const methods = await getPaymentMethods();
        expect(methods.find((m) => m.id === 'stripe')).toBeDefined();
    });
});
