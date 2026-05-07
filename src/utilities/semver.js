'use strict';

/**
 * semver.js — lightweight semver helpers for versionGate middleware.
 *
 * Intentionally minimal: major.minor.patch only.
 * Pre-release tags (e.g. -beta.1) are stripped before comparison.
 * No external dependencies.
 */

const MAX_VERSION_LENGTH = 32;

/**
 * Parse a version string into [major, minor, patch] integer tuple.
 * Returns null if the input is not a parseable version string.
 *
 * @param {*} version
 * @returns {[number, number, number] | null}
 */
function parseVersion(version) {
  if (version == null) return null;
  if (typeof version !== 'string') return null;

  const trimmed = version.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_VERSION_LENGTH) return null;

  // Strip pre-release tag (e.g. '1.2.3-beta.1' → '1.2.3')
  const base = trimmed.split('-')[0];

  const parts = base.split('.');
  if (parts.length < 1 || parts.length > 3) return null;

  const nums = parts.map((p) => {
    const n = parseInt(p, 10);
    return Number.isNaN(n) || p.trim() === '' ? NaN : n;
  });

  if (nums.some(Number.isNaN)) return null;

  // Coerce missing components to 0: '1.2' → [1, 2, 0]
  while (nums.length < 3) nums.push(0);

  return /** @type {[number, number, number]} */ (nums);
}

/**
 * Compare two version strings.
 *
 * Returns:
 *  -1  if a < b
 *   0  if a === b
 *   1  if a > b
 *
 * Handles '1.0.10' vs '1.0.9' correctly (numeric, not lexicographic).
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
function compareSemver(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);

  if (!pa || !pb) {
    throw new TypeError(`compareSemver: unparseable version(s): "${a}", "${b}"`);
  }

  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * Returns true if `actual` is strictly less than `minimum`.
 * Fails open (returns false) if either version is malformed — we never
 * want to reject a request just because the version string is weird.
 *
 * @param {*} actual
 * @param {*} minimum
 * @returns {boolean}
 */
function isVersionLess(actual, minimum) {
  const pa = parseVersion(actual);
  const pm = parseVersion(minimum);

  // Fail-open: malformed input → do not block
  if (!pa || !pm) return false;

  try {
    return compareSemver(actual, minimum) === -1;
  } catch (_) {
    return false;
  }
}

module.exports = { compareSemver, isVersionLess };
