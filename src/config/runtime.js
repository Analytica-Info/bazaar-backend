'use strict';

/**
 * runtime.js — env-driven tunable configuration.
 *
 * Reads process.env at module load time and validates required vars.
 * All values have safe defaults so the server starts in development
 * without a full .env.  Required vars (secrets) throw at startup if
 * absent — fail fast beats a mysterious runtime 500.
 *
 * Convention:
 *   - Durations stored in milliseconds (MS suffix) for Date/cookie math.
 *   - Cache TTLs stored in seconds (matching Redis EX convention).
 *   - parseInt(..., 10) used consistently; NaN-guard falls back to default.
 */

const { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } = require('./constants/time');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Parse an env var as integer, falling back to `defaultVal` on missing/NaN. */
function envInt(name, defaultVal) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultVal;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

/** Parse an env var as a float, falling back to `defaultVal` on missing/NaN. */
function envFloat(name, defaultVal) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultVal;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

// ── config object ─────────────────────────────────────────────────────────────

const config = Object.freeze({
  /**
   * Cache TTLs — all in seconds (Redis EX).
   * Override via env to tune without a deploy.
   */
  cache: {
    /** Smart category endpoints (trending, today-deal, flash-sale, etc.) */
    smartCategoryTtl:   envInt('CACHE_TTL_SMART_CATEGORY',  300),

    /** Product sidebar categories */
    categoriesTtl:      envInt('CACHE_TTL_CATEGORIES',       300),

    /** All-categories list used by mobile/web nav */
    allCategoriesTtl:   envInt('CACHE_TTL_ALL_CATEGORIES',   300),

    /** Home-products endpoint (new arrivals, featured, etc.) */
    homeProductsTtl:    envInt('CACHE_TTL_HOME_PRODUCTS',    300),

    /** Lightspeed product inventory snapshot */
    lsInventoryTtl:     envInt('CACHE_TTL_LS_INVENTORY',     300),

    /** Lightspeed full product list */
    lsProductsTtl:      envInt('CACHE_TTL_LS_PRODUCTS',      600),

    /** Lightspeed category list */
    lsCategoriesTtl:    envInt('CACHE_TTL_LS_CATEGORIES',   3600),

    /** Products-by-variant color grouping (mobile) */
    productsByVariantTtl: envInt('CACHE_TTL_PRODUCTS_BY_VARIANT', 300),

    /** Lightspeed product-type (category detail) pages */
    productTypeTtl:     envInt('CACHE_TTL_PRODUCT_TYPE',    1800),

    /** Max-discount metric cached after a full product sync */
    maxDiscountTtl:     envInt('CACHE_TTL_MAX_DISCOUNT',    21600),  // 6 h

    /** Webhook dedup lock — short, prevents double-processing a burst */
    webhookDedupTtl:    envInt('CACHE_TTL_WEBHOOK_DEDUP',       3),

    /** Redis metrics counter (request counts, error log) */
    metricsCounterTtl:  envInt('CACHE_TTL_METRICS_COUNTER',  10800), // 3 h

    /** Error log key TTL */
    errorLogTtl:        envInt('CACHE_TTL_ERROR_LOG',        86400), // 24 h
  },

  /**
   * Auth / token expiry.
   * OTP windows are in milliseconds for Date arithmetic.
   * JWT expiry strings are kept as strings (jsonwebtoken accepts e.g. '1h').
   */
  auth: {
    /** OTP / recovery-code expiry window (ms) */
    recoveryCodeExpiryMs:   envInt('OTP_EXPIRY_MINUTES',       15) * MS_PER_MINUTE,

    /** Password-reset token expiry window (ms) */
    resetPasswordExpiryMs:  envInt('RESET_TOKEN_EXPIRY_MINUTES', 10) * MS_PER_MINUTE,

    /** Recovery-code resend sliding window (ms) */
    recoveryResendWindowMs: envInt('RECOVERY_RESEND_WINDOW_HOURS', 24) * MS_PER_HOUR,

    /**
     * Cookie max-age for a regular (non-remember-me) session (ms).
     * Default: 7 days.
     */
    sessionCookieMaxAgeMs:     envInt('SESSION_COOKIE_DAYS',       7)  * MS_PER_DAY,

    /**
     * Cookie max-age when "remember me" is checked (ms).
     * Default: 30 days.
     */
    rememberMeCookieMaxAgeMs:  envInt('REMEMBER_ME_COOKIE_DAYS',   30) * MS_PER_DAY,

    /**
     * Cookie max-age for web (v2) session without remember-me (ms).
     * Default: 1 day (matches previous hardcoded 24 * 60 * 60 * 1000).
     */
    webCookieMaxAgeMs:         envInt('WEB_COOKIE_DAYS',            1)  * MS_PER_DAY,

    // ── JWT expiry strings (jsonwebtoken format, e.g. '1h', '7d') ──────────

    /**
     * Standard access token lifetime (login and checkAccessToken re-issue).
     */
    accessTokenExpiry:         process.env.JWT_ACCESS_EXPIRY              || '1h',

    /**
     * Access token lifetime issued by the dedicated /refresh endpoint.
     * Intentionally shorter than accessTokenExpiry — the refresh path
     * rotates tokens frequently, so short-lived access tokens reduce the
     * blast radius of a leaked token between rotations.
     * See docs/BUGS.md BUG-035 for context.
     */
    accessTokenRefreshExpiry:  process.env.JWT_ACCESS_REFRESH_EXPIRY      || '2m',

    /**
     * Refresh token lifetime (all issuance paths share the same window).
     */
    refreshTokenExpiry:        process.env.JWT_REFRESH_EXPIRY             || '7d',

    /**
     * Admin session token lifetime.
     */
    adminTokenExpiry:          process.env.JWT_ADMIN_EXPIRY               || '7d',

    /**
     * Short-lived code token used for password-reset verification.
     */
    resetCodeTokenExpiry:      process.env.JWT_RESET_CODE_EXPIRY          || '10m',
  },

  /**
   * Rate-limiting windows (ms) and caps.
   * Changing these requires a server restart.
   */
  rateLimit: {
    /** Window for auth endpoints (login, register, refresh) */
    authWindowMs:           envInt('RATE_LIMIT_AUTH_WINDOW_MINUTES',     15) * MS_PER_MINUTE,
    /** Max attempts per auth window */
    authMax:                envInt('RATE_LIMIT_AUTH_MAX',                 20),

    /** Window for password-reset endpoint */
    passwordResetWindowMs:  envInt('RATE_LIMIT_PWD_RESET_WINDOW_MINUTES', 15) * MS_PER_MINUTE,
    /** Max attempts per password-reset window */
    passwordResetMax:       envInt('RATE_LIMIT_PWD_RESET_MAX',             5),
  },

  /**
   * Order / fulfilment business rules.
   */
  order: {
    /**
     * Calendar days added to today for estimated delivery date shown
     * in order-confirmation emails.
     */
    deliveryDays: envInt('DELIVERY_DAYS', 3),

    /**
     * Pending-payment document TTL (ms).
     * Default: 30 minutes — matches Mongoose model default.
     */
    pendingPaymentExpiryMs: envInt('PENDING_PAYMENT_EXPIRY_MINUTES', 30) * MS_PER_MINUTE,
  },

  /**
   * External API timeouts (ms).
   */
  external: {
    /** Nomod checkout API request timeout */
    nomodTimeoutMs: envInt('NOMOD_TIMEOUT_MS', 30_000),
  },

  /**
   * Mobile version gate.
   * Read by src/middleware/versionGate.js.
   */
  mobile: {
    /**
     * Minimum mobile app version. Mobile clients sending an older version
     * receive 426 Upgrade Required when enforcement is on.
     */
    minSupportedVersion: process.env.MIN_SUPPORTED_MOBILE_VERSION || '1.0.0',

    /**
     * Whether to actively reject old versions (true) or just log/observe (false).
     * Default false until mobile side ships X-App-Version + force-update dialog
     * (BUG-053). Flip to true after the mobile release adoption is high enough.
     * Only the literal string 'true' enables enforcement — opt-in only.
     */
    enforceMinVersion: process.env.MIN_SUPPORTED_MOBILE_VERSION_ENFORCE === 'true',

    /**
     * Update URLs returned in the 426 response body so mobile clients can
     * deep-link to the app store.
     */
    updateUrls: {
      ios:     process.env.IOS_UPDATE_URL     || 'https://apps.apple.com/app/bazaar/id0000000000',
      android: process.env.ANDROID_UPDATE_URL || 'https://play.google.com/store/apps/details?id=com.bazaar.app',
    },
  },
});

module.exports = config;
