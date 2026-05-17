'use strict';
require('../../../setup');

/**
 * FirstOrder predicate — server-side DB verification tests.
 *
 * CRITICAL-1: predicate must NOT trust ctx.is_first_order; it queries the
 * Order collection directly by phone.
 */

const mongoose = require('mongoose');
const EligibilityVerdict = require('../../../../src/services/coupon/domain/EligibilityVerdict');
const REASONS = require('../../../../src/services/coupon/domain/rejection-reasons');
const firstOrder = require('../../../../src/services/coupon/predicates/FirstOrder');

// ── helpers ──────────────────────────────────────────────────────────────────

const Order = require('../../../../src/repositories').orders.rawModel();

async function createOrder(phone) {
  return Order.create({
    name: 'Test Customer',
    phone,
    address: '123 Test St',
    email: 'test@example.com',
    status: 'completed',
    amount_subtotal: '100',
    amount_total: '100',
    discount_amount: '0',
    txn_id: `txn-${Math.random()}`,
    payment_method: 'card',
    payment_status: 'paid',
    order_id: `ORD-${Math.random()}`,
    order_no: Math.floor(Math.random() * 1e9),
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FirstOrder predicate — server-side DB verification', () => {
  const rule = { type: 'first_order' };

  it('rejects when caller sends is_first_order:true but DB shows a prior order', async () => {
    const phone = '+971501000001';
    await createOrder(phone);

    // Attacker injects is_first_order:true — predicate must ignore it.
    const verdict = await firstOrder(rule, { phone, is_first_order: true });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.FIRST_ORDER_ONLY);
  });

  it('passes when is_first_order:false but DB shows no prior order', async () => {
    const phone = '+971501000002';
    // No order in DB for this phone.

    const verdict = await firstOrder(rule, { phone, is_first_order: false });
    expect(verdict.eligible).toBe(true);
  });

  it('rejects when phone is absent (conservative)', async () => {
    const verdict = await firstOrder(rule, {});
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.FIRST_ORDER_ONLY);
  });

  it('rejects when phone has prior orders and is_first_order is omitted', async () => {
    const phone = '+971501000003';
    await createOrder(phone);

    const verdict = await firstOrder(rule, { phone });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.FIRST_ORDER_ONLY);
  });

  it('passes for a genuinely new phone with no prior orders', async () => {
    const phone = '+971501000004';

    const verdict = await firstOrder(rule, { phone });
    expect(verdict.eligible).toBe(true);
  });
});
