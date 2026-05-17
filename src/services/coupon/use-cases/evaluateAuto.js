'use strict';

/**
 * evaluateAuto.js — read-only evaluation of auto-triggered coupons.
 *
 * NEVER creates a CouponRedemption. Intended for cart_render, checkout_intent,
 * signup, scheduled, and manual_grant triggers — NOT for the 'code' trigger.
 */

const { validate } = require('./validate');
const candidateRepository = require('../infrastructure/candidateRepository');
const eligibilityCache = require('../infrastructure/eligibilityCache');
const { TRIGGERS, isAutoTrigger } = require('../domain/triggers');
const logger = require('../../../utilities/logger');

/**
 * Evaluate auto-trigger coupons for a given context.
 *
 * Groups results by stack_group: within each group only the highest-priority
 * winner is kept. Coupons with stack_group === null are kept individually.
 *
 * @param {object} params
 * @param {string} params.trigger - must be an auto trigger (not 'code')
 * @param {string} [params.user_id]
 * @param {string} [params.phone]
 * @param {object} [params.cart]
 * @param {object} [params.ctx]
 * @returns {Promise<Array<{ coupon: object, discount: object, verdict: object }>>}
 */
async function evaluateAuto({ trigger, user_id, phone, cart = {}, ctx = {} }) {
  if (!trigger || !isAutoTrigger(trigger)) {
    throw new Error('evaluateAuto requires an auto trigger');
  }

  const identity = user_id || phone || 'anon';
  const cartHash = eligibilityCache.hashCart(cart);
  const cacheKey = eligibilityCache.buildKey({ trigger, identity, cartHash });

  // Cache hit fast path
  const cached = await eligibilityCache.get(cacheKey);
  if (cached !== undefined) {
    logger.warn({ ctx: { trigger, identity }, cacheKey }, 'evaluateAuto: cache hit');
    return cached;
  }

  // Fetch candidates
  const candidates = await candidateRepository.findActiveByTrigger(trigger, { limit: 50 });

  // Validate each candidate (re-uses validate.js, no duplication)
  const winners = [];
  for (const c of candidates) {
    try {
      const result = await validate({ code: c.code, phone, user_id, cart, ctx });
      if (result.verdict.eligible) {
        winners.push({ coupon: result.coupon, discount: result.discount, verdict: result.verdict });
      }
    } catch (err) {
      logger.warn({ err, coupon_code: c.code }, 'evaluateAuto: error validating candidate');
    }
  }

  // Group by stack_group: highest-priority per group; null = individual
  const groups = new Map(); // group key → winner
  const nullGroupWinners = [];

  for (const w of winners) {
    const sg = w.coupon.stack_group || null;
    if (sg === null) {
      nullGroupWinners.push(w);
    } else {
      const existing = groups.get(sg);
      if (!existing || (w.coupon.priority > existing.coupon.priority)) {
        groups.set(sg, w);
      }
    }
  }

  const result = [...nullGroupWinners, ...Array.from(groups.values())];

  // Cache with 60s TTL (best-effort)
  await eligibilityCache.set(cacheKey, result, 60);

  return result;
}

module.exports = { evaluateAuto };
