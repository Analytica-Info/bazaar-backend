'use strict';

/**
 * serializeReward — translate an AppliedDiscount into the public v2 wire
 * shape consumed by mobile / web / admin clients.
 *
 * CONTRACT
 *
 * The wire reward is FLAT for every reward type:
 *
 *   { type, ...payload }
 *
 * No nested `.meta`. No storage-layer schema names. The reward classes'
 * `apply()` method already builds the canonical wire fields under
 * `discount.meta` (see e.g. FreeGiftReward) — this function flattens that
 * into the top-level shape the public contract specifies.
 *
 * STORAGE → WIRE TRANSLATION
 *
 * Storage (CouponV2.reward, Mongo schema):
 *   { type: 'free_gift', gift_product_id, gift_product_name, gift_value_aed }
 *
 * Wire (this function's output, public contract):
 *   { type: 'free_gift', product_id, msrp_aed, product_name?, product_image?, unit_label?, display_label? }
 *
 * Storage-layer field names (gift_product_id, gift_value_aed,
 * gift_product_name, subtotal_threshold, pct_off, etc.) MUST NOT appear in
 * the output. Tests assert their absence as a regression guard.
 *
 * WHY A SEPARATE MODULE
 *
 * Every public emission point (validate controller, apply use case,
 * eligible use case) goes through this one function. If the contract
 * changes, one edit. If a reward class ever produces a field the wire
 * shouldn't expose, a per-type allowlist can be applied here without
 * touching any caller.
 *
 * @param {import('../domain/AppliedDiscount')|null|undefined} discount
 *   Result of `RewardClass.apply()`. `null`/`undefined` returns `null`.
 * @returns {(object|null)} flat wire reward `{ type, ...payload }`, or `null` when input is falsy
 */
function serializeReward(discount) {
  if (!discount || !discount.type) return null;
  const meta = discount.meta && typeof discount.meta === 'object' ? discount.meta : {};
  // Spread meta FIRST so that discount.type always wins — a malformed reward
  // class that accidentally puts `type` in its own meta cannot override the
  // canonical reward type on the wire.
  return {
    ...meta,
    type: discount.type,
  };
}

module.exports = { serializeReward };
