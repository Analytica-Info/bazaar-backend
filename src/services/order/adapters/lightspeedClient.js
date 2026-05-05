'use strict';

/**
 * Redirect: all Lightspeed client helpers now live in the shared layer.
 *
 * NOTE — fetchProductDetails price field (BUG-028):
 *   The original mobile-app copy used `tax_exclusive`. The shared version uses
 *   `tax_inclusive` (the website checkout value). Mobile callers should verify
 *   that tax-inclusive pricing is correct for their display context.
 *   See docs/BUGS.md BUG-028.
 */
module.exports = require('../../shared/lightspeedClient');
