'use strict';

/**
 * EligibilityVerdict — value object returned by every predicate and validate.js.
 */
class EligibilityVerdict {
  /**
   * @param {object} opts
   * @param {boolean} opts.eligible
   * @param {string|null} [opts.reason] - one of REASONS enum
   * @param {boolean} [opts.recoverable] - true if user can fix (e.g. add items to cart)
   * @param {string|null} [opts.message] - human-readable message
   */
  constructor({ eligible, reason = null, recoverable = false, message = null }) {
    this.eligible = eligible;
    this.reason = reason;
    this.recoverable = recoverable;
    this.message = message;
    Object.freeze(this);
  }

  /**
   * @returns {EligibilityVerdict}
   */
  static pass() {
    return new EligibilityVerdict({ eligible: true });
  }

  /**
   * @param {string} reason - REASONS enum value
   * @param {string} message
   * @param {boolean} [recoverable]
   * @returns {EligibilityVerdict}
   */
  static fail(reason, message, recoverable = false) {
    return new EligibilityVerdict({ eligible: false, reason, message, recoverable });
  }
}

module.exports = EligibilityVerdict;
