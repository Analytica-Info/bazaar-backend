'use strict';

/**
 * AppliedDiscount — value object returned by reward.apply().
 */
class AppliedDiscount {
  /**
   * @param {object} opts
   * @param {number} opts.aed - total discount in AED (rounded to 2dp)
   * @param {string} opts.type - reward type string
   * @param {Array} [opts.line_adjustments] - per-line breakdowns (optional)
   * @param {object} [opts.meta] - reward-specific metadata
   */
  constructor({ aed, type, line_adjustments = [], meta = {} }) {
    this.aed = Math.round(aed * 100) / 100;
    this.type = type;
    this.line_adjustments = line_adjustments;
    this.meta = meta;
    Object.freeze(this);
  }
}

module.exports = AppliedDiscount;
