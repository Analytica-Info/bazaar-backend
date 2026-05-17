'use strict';

/**
 * jest.envSetup.js — runs BEFORE any module is required.
 *
 * Several modules construct external SDK clients at module-load time using
 * env vars (BUG-010: Stripe, Tabby, Nomod, Firebase). In CI / local jest
 * those env vars are not set, so module-load throws before any test runs.
 *
 * This file injects safe dummy values when not already defined. It does NOT
 * override real values supplied by the developer (e.g. via `.env.test` or
 * shell exports), and tests that genuinely exercise these SDKs continue to
 * use their own per-test mocks.
 *
 * Wired into jest via `setupFiles` in jest.config.js (runs in each project).
 */

const defaults = {
    STRIPE_SK: 'sk_test_dummy',
    STRIPE_PK: 'pk_test_dummy',
    TABBY_AUTH_KEY: 'tabby_dummy_auth',
    TABBY_SECRET_KEY: 'tabby_dummy_secret',
    NOMOD_API_KEY: 'nomod_dummy',
    NODE_ENV: 'test',
};

for (const [k, v] of Object.entries(defaults)) {
    if (process.env[k] === undefined) {
        process.env[k] = v;
    }
}
