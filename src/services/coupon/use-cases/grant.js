'use strict';

/**
 * grant.js — issue a personalised coupon to a specific user/phone,
 * cloned from a template CouponV2 document.
 */

const crypto = require('crypto');
const CouponV2 = require('../../../models/CouponV2');
const logger = require('../../../utilities/logger');

/**
 * Grant a personalised coupon from a template.
 *
 * Idempotency: if idempotency_key is supplied and a coupon with
 * metadata.idempotency_key already exists, the existing coupon is returned
 * without creating a new one.
 *
 * @param {object} params
 * @param {string} params.template_id - _id of the source CouponV2 template
 * @param {string} [params.user_id]
 * @param {string} [params.phone]
 * @param {string} [params.granted_by] - actor id (admin / system)
 * @param {number} [params.expires_in_days=30]
 * @param {string} [params.idempotency_key]
 * @returns {Promise<{ coupon: object }>}
 */
async function grant({ template_id, user_id, phone, granted_by, expires_in_days = 30, idempotency_key }) {
  // Idempotency check
  if (idempotency_key) {
    const existing = await CouponV2.findOne({ 'metadata.idempotency_key': idempotency_key }).lean();
    if (existing) {
      logger.warn({ ctx: { template_id, idempotency_key } }, 'grant: idempotent — returning existing coupon');
      return { coupon: existing };
    }
  }

  // Load template
  const template = await CouponV2.findById(template_id).lean();
  if (!template || template.status !== 'active') {
    const err = new Error('Template coupon not found or not active');
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + expires_in_days * 24 * 60 * 60 * 1000);
  const suffix = crypto.randomBytes(12).toString('hex');
  const userPart = user_id || 'guest';
  const code = `grant_${userPart}_${suffix}`;

  const metadata = Object.assign({}, template.metadata || {}, {
    granted_from_template: template_id,
    granted_at: now,
  });
  if (idempotency_key) {
    metadata.idempotency_key = idempotency_key;
  }

  const doc = new CouponV2({
    // Cloned fields
    name: template.name,
    description: template.description,
    reward: JSON.parse(JSON.stringify(template.reward)),
    rules: JSON.parse(JSON.stringify(template.rules || [])),
    max_uses_user: template.max_uses_user != null ? template.max_uses_user : 1,
    priority: template.priority,
    stack_group: template.stack_group || null,
    stackable: template.stackable || false,
    // Personalised fields
    trigger: 'code',
    code,
    max_uses_total: 1,
    uses_remaining: 1,
    starts_at: now,
    ends_at: endsAt,
    status: 'active',
    created_by: granted_by || null,
    metadata,
  });

  await doc.save();

  logger.warn({ ctx: { template_id, user_id, phone } }, 'grant: coupon granted');

  return { coupon: doc.toObject() };
}

module.exports = { grant };
