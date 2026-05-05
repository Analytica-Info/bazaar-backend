'use strict';

/**
 * validateEnv.js — startup environment validator.
 *
 * Usage:
 *   node scripts/validateEnv.js          # exits 1 on missing required keys
 *   npm run validate-env
 *
 * Also importable as a pure function for tests:
 *   const { validate } = require('./validateEnv');
 *   const { ok, lines } = validate(process.env);
 */

// ── Schema ────────────────────────────────────────────────────────────────────

/**
 * REQUIRED — no default, crash-worthy if absent in production.
 * Keys match the exact process.env names used in src/config/*.
 */
const REQUIRED_KEYS = [
  'MONGO_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'STRIPE_SK',
];

/**
 * TUNABLES — all have defaults in runtime.js; unset is informational only.
 * Grouped by section for readable output.
 */
const TUNABLE_GROUPS = {
  'cache': [
    'CACHE_TTL_SMART_CATEGORY',
    'CACHE_TTL_CATEGORIES',
    'CACHE_TTL_ALL_CATEGORIES',
    'CACHE_TTL_HOME_PRODUCTS',
    'CACHE_TTL_LS_INVENTORY',
    'CACHE_TTL_LS_PRODUCTS',
    'CACHE_TTL_LS_CATEGORIES',
    'CACHE_TTL_PRODUCTS_BY_VARIANT',
    'CACHE_TTL_PRODUCT_TYPE',
    'CACHE_TTL_MAX_DISCOUNT',
    'CACHE_TTL_WEBHOOK_DEDUP',
    'CACHE_TTL_METRICS_COUNTER',
    'CACHE_TTL_ERROR_LOG',
  ],
  'auth': [
    'OTP_EXPIRY_MINUTES',
    'RESET_TOKEN_EXPIRY_MINUTES',
    'RECOVERY_RESEND_WINDOW_HOURS',
    'SESSION_COOKIE_DAYS',
    'REMEMBER_ME_COOKIE_DAYS',
    'WEB_COOKIE_DAYS',
    'JWT_ACCESS_EXPIRY',
    'JWT_ACCESS_REFRESH_EXPIRY',
    'JWT_REFRESH_EXPIRY',
    'JWT_ADMIN_EXPIRY',
    'JWT_RESET_CODE_EXPIRY',
  ],
  'rate-limit': [
    'RATE_LIMIT_AUTH_WINDOW_MINUTES',
    'RATE_LIMIT_AUTH_MAX',
    'RATE_LIMIT_PWD_RESET_WINDOW_MINUTES',
    'RATE_LIMIT_PWD_RESET_MAX',
  ],
  'order': [
    'DELIVERY_DAYS',
    'PENDING_PAYMENT_EXPIRY_MINUTES',
  ],
  'external': [
    'NOMOD_TIMEOUT_MS',
  ],
  'mobile-version-gate': [
    'MIN_SUPPORTED_MOBILE_VERSION',
    'MIN_SUPPORTED_MOBILE_VERSION_ENFORCE',
    'IOS_UPDATE_URL',
    'ANDROID_UPDATE_URL',
  ],
};

// ── Pure validation function ──────────────────────────────────────────────────

/**
 * Validate an env object against the schema above.
 *
 * @param {Record<string, string | undefined>} env  — typically process.env
 * @returns {{ ok: boolean, lines: string[] }}
 *   ok    — false if any REQUIRED key is missing
 *   lines — human-readable output lines (one per key + section headers)
 */
function validate(env) {
  const lines = [];
  let ok = true;

  // Required keys
  lines.push('# Required');
  for (const key of REQUIRED_KEYS) {
    const val = env[key];
    if (val === undefined || val === '') {
      lines.push(`  x ${key} missing`);
      ok = false;
    } else {
      // Redact secrets — show first 4 chars + ***
      const display = val.length > 4 ? `${val.slice(0, 4)}***` : '***';
      lines.push(`  + ${key} = ${display}`);
    }
  }

  // Tunables
  for (const [group, keys] of Object.entries(TUNABLE_GROUPS)) {
    lines.push(`# Tunables — ${group}`);
    for (const key of keys) {
      const val = env[key];
      if (val === undefined || val === '') {
        lines.push(`  . ${key} = default`);
      } else {
        lines.push(`  + ${key} = ${val}`);
      }
    }
  }

  return { ok, lines };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

/* istanbul ignore next */
if (require.main === module) {
  const { ok, lines } = validate(process.env);
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
  if (!ok) {
    // eslint-disable-next-line no-console
    console.error('\nERROR: One or more required environment variables are missing.');
    process.exit(1);
  }
}

module.exports = { validate, REQUIRED_KEYS, TUNABLE_GROUPS };
