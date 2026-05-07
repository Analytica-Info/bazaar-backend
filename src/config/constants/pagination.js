'use strict';

/**
 * pagination.js — API contract constants for list endpoints.
 *
 * These are NOT env-driven because they are part of the public API
 * contract.  Changing them would be a breaking change for clients.
 * Keep them as named constants so all call-sites share one definition.
 */

/** Default number of items returned per page when no limit is specified. */
const DEFAULT_PAGE_SIZE = 20;

/** Maximum number of items a caller may request in a single page. */
const MAX_PAGE_SIZE = 100;

/** Minimum number of items per page (guards against limit=0 attacks). */
const MIN_PAGE_SIZE = 1;

/** Default starting page index. */
const DEFAULT_PAGE = 1;

/** Default (smaller) page size for admin list endpoints. */
const ADMIN_DEFAULT_PAGE_SIZE = 10;

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  DEFAULT_PAGE,
  ADMIN_DEFAULT_PAGE_SIZE,
};
