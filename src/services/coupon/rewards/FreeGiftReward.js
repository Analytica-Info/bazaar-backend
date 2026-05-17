'use strict';

const { register } = require('./index');
const AppliedDiscount = require('../domain/AppliedDiscount');

/**
 * FreeGiftReward — adds a free gift item to the order.
 *
 * Required output fields (always present, frozen contract):
 *   - type:             'free_gift'
 *   - aed:              number (gift_value_aed)
 *   - meta.product_id:  string (from coupon config)
 *   - meta.msrp_aed:    number (from coupon config)
 *
 * Optional enriched fields (present when validate.js successfully hydrated the
 * gift product via ctx.giftProduct, OR when display_label was set on the
 * coupon config / metadata):
 *   - meta.product_name:   string (from Product.product.name)
 *   - meta.product_image:  string (absolute URL, picked via standard image-derivation)
 *   - meta.unit_label:     string (variant.name, only when meaningfully non-default)
 *   - meta.display_label:  string (coupon-authored override, else auto-built from name + msrp)
 *
 * NOTE: storage-layer field names (`gift_product_id`, `gift_product_name`,
 * `gift_value_aed`) are NEVER emitted on `meta` — they belong to the
 * Mongoose schema for `CouponV2.reward` and stay there. The wire layer
 * (`serializeReward`) flattens meta to the public response, so any name
 * appearing here also appears in the public API. Keeping storage names
 * out of meta is the single source of truth for the wire-shape contract.
 *
 * DESIGN NOTE — apply() is sync and pure (no I/O).
 *
 * Hydration of the gift Product is performed once by validate.js after the
 * predicates pass, and the resolved doc is forwarded here via the second
 * argument as `ctx.giftProduct`. This keeps reward classes pure (the
 * registry's contract is a sync function), avoids duplicate lookups when
 * validate is called from both apply() and evaluateAuto(), and means a
 * lookup failure in validate.js silently degrades to the legacy minimal
 * shape — older mobile builds keep parsing correctly.
 *
 * Alternative considered: make apply() async and look up the product here.
 * Rejected because (a) every other reward class is sync, (b) it would
 * duplicate I/O when evaluateAuto re-runs validate per candidate, and
 * (c) it couples the reward layer to the products repository.
 */
class FreeGiftReward {
  /**
   * Build the AppliedDiscount for a free-gift coupon.
   *
   * @param {object} config - coupon.reward block
   * @param {string} config.gift_product_id
   * @param {string} [config.gift_product_name]
   * @param {number} config.gift_value_aed
   * @param {string} [config.display_label] - explicit copy override (wins over auto-built)
   * @param {string} [config.gift_variant_id]
   * @param {object} [config.metadata] - { display_label?: string }
   * @param {object} [ctx] - hydration context provided by validate.js
   * @param {object} [ctx.giftProduct] - resolved Product doc shape (lean):
   *   { _id, product: { name, images?, image? }, variantsData?, giftVariantId? }
   * @returns {AppliedDiscount}
   */
  static apply(config, ctx = {}) {
    const productId = String(config.gift_product_id || '');
    const msrpAed = Number(config.gift_value_aed) || 0;

    /** @type {Record<string, any>} */
    const meta = {
      // Required fields — frozen wire contract
      product_id: productId,
      msrp_aed: msrpAed,
    };

    const gift = ctx && ctx.giftProduct ? ctx.giftProduct : null;
    const giftName = pickProductName(gift);
    const giftImage = pickProductImage(gift);
    const giftUnit = pickUnitLabel(gift, config.gift_variant_id);

    if (giftName) meta.product_name = giftName;
    if (giftImage) meta.product_image = giftImage;
    if (giftUnit) meta.unit_label = giftUnit;

    // display_label: explicit wins (config.display_label, then config.metadata.display_label),
    // else auto-build when we have a resolved product name. msrp_aed = 0 is treated as a
    // valid (if unusual) configuration and still composes — gift-with-purchase promotions
    // commonly carry no msrp accounting.
    const explicitLabel =
      (typeof config.display_label === 'string' && config.display_label) ||
      (config.metadata && typeof config.metadata.display_label === 'string' && config.metadata.display_label) ||
      null;

    if (explicitLabel) {
      meta.display_label = explicitLabel;
    } else if (giftName) {
      meta.display_label = `Free ${giftName} (worth AED ${msrpAed})`;
    }

    return new AppliedDiscount({
      aed: msrpAed,
      type: 'free_gift',
      meta,
    });
  }
}

/** @param {any} gift */
function pickProductName(gift) {
  if (!gift) return null;
  const name = gift.product && gift.product.name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/** Standard image-derivation pattern used elsewhere in this codebase. */
function pickProductImage(gift) {
  if (!gift) return null;
  const p = gift.product || {};
  const firstImg = Array.isArray(p.images) ? p.images[0] : null;
  const url =
    (firstImg && firstImg.sizes && firstImg.sizes.original) ||
    (firstImg && firstImg.url) ||
    (p.image && p.image.url) ||
    null;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/**
 * Variant-level unit label. Returns null when the variant name is missing or
 * is the catch-all "Default" — emitting "Default" to the customer is worse
 * than emitting nothing.
 */
function pickUnitLabel(gift, configVariantId) {
  if (!gift || !Array.isArray(gift.variantsData) || gift.variantsData.length === 0) return null;
  const targetId = configVariantId || gift.giftVariantId || null;
  const variant = targetId
    ? gift.variantsData.find((v) => v && (v.id === targetId || v.id === String(targetId)))
    : gift.variantsData[0];
  const name = variant && variant.name;
  if (typeof name !== 'string' || name.length === 0) return null;
  if (name === 'Default') return null;
  return name;
}

register('free_gift', FreeGiftReward);
module.exports = FreeGiftReward;
