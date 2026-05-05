'use strict';

/**
 * time.js — canonical time-unit constants in milliseconds and seconds.
 *
 * All values are plain arithmetic so they remain tree-shakeable and
 * zero-cost at runtime.  Use these everywhere a "magic" duration
 * would otherwise appear.
 *
 * Convention:
 *   MS_PER_*   — milliseconds  (for Date arithmetic, cookie maxAge, jwt numeric exp)
 *   SEC_PER_*  — seconds       (for Redis TTL, jwt expiresIn numeric strings)
 */

// ── millisecond constants ─────────────────────────────────────────────────────

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR   = 60 * MS_PER_MINUTE;
const MS_PER_DAY    = 24 * MS_PER_HOUR;
const MS_PER_WEEK   = 7  * MS_PER_DAY;

// ── second constants (Redis TTL, jwt string helpers) ─────────────────────────

const SEC_PER_MINUTE = 60;
const SEC_PER_HOUR   = 60 * SEC_PER_MINUTE;
const SEC_PER_DAY    = 24 * SEC_PER_HOUR;
const SEC_PER_WEEK   = 7  * SEC_PER_DAY;

module.exports = {
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  MS_PER_WEEK,
  SEC_PER_MINUTE,
  SEC_PER_HOUR,
  SEC_PER_DAY,
  SEC_PER_WEEK,
};
