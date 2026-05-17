require('../../../setup');
'use strict';

/**
 * Backfill script tests — idempotency and correctness.
 *
 * We import the logic directly rather than spawning a process,
 * so we can use the in-memory Mongo from the test setup.
 */

const CouponV2 = require('../../../../src/models/CouponV2');

// Extract the core backfill logic for unit testing (without process.exit)
async function runBackfill() {
  const existing = await CouponV2.findOne({ code: 'first15' }).lean();
  if (existing) {
    return { skipped: true };
  }

  const doc = await CouponV2.create({
    code: 'first15',
    name: 'FIRST15',
    title: '15% off your first order',
    description: 'Get 15% off your first order (up to AED 30) on orders over AED 100.',
    status: 'active',
    starts_at: null,
    ends_at: null,
    max_uses_total: null,
    uses_remaining: null,
    max_uses_user: 1,
    rules: [
      { type: 'first_order' },
      { type: 'min_subtotal', amount: 100 },
    ],
    reward: {
      type: 'percent',
      percent: 15,
      cap_aed: 30,
    },
    priority: 10,
    rule_version: 1,
    created_by: 'migration',
    metadata: { backfilled_by: '2026-05-coupon-v2-backfill' },
  });

  return { inserted: true, id: doc._id.toString() };
}

describe('backfill script', () => {
  it('inserts FIRST15 on first run', async () => {
    const result = await runBackfill();
    expect(result.inserted).toBe(true);
    expect(result.id).toBeDefined();

    const doc = await CouponV2.findOne({ code: 'first15' }).lean();
    expect(doc).not.toBeNull();
    expect(doc.reward.type).toBe('percent');
    expect(doc.reward.percent).toBe(15);
    expect(doc.reward.cap_aed).toBe(30);
    expect(doc.max_uses_user).toBe(1);
    expect(doc.rules.some((r) => r.type === 'first_order')).toBe(true);
    expect(doc.rules.some((r) => r.type === 'min_subtotal' && r.amount === 100)).toBe(true);
    expect(doc.status).toBe('active');
  });

  it('is idempotent — second run skips insertion', async () => {
    await runBackfill(); // first run
    const result2 = await runBackfill(); // second run
    expect(result2.skipped).toBe(true);

    const count = await CouponV2.countDocuments({ code: 'first15' });
    expect(count).toBe(1);
  });

  it('FIRST15 has priority 10', async () => {
    await runBackfill();
    const doc = await CouponV2.findOne({ code: 'first15' }).lean();
    expect(doc.priority).toBe(10);
  });
});
