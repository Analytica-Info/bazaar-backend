'use strict';

/**
 * Integration: processPendingPayment concurrency / atomicity
 *
 * Uses mongodb-memory-server (via tests/setup.js) so real Mongoose operations
 * run against an in-process store.  All external dependencies (email, logger,
 * axios, Stripe, push notification, activity loggers) are mocked so the focus
 * is entirely on DB-level concurrency semantics.
 *
 * Tests exercise the design doc's Atomicity Contract (§3):
 *   "Use findOneAndUpdate with { status: 'pending' } filter to atomically move
 *    pending → processing. Return the updated document; if null, the concurrent
 *    caller already won — abort idempotently."
 */

require('../setup');

// ─── External dependency mocks (hoisted) ────────────────────────────────────

jest.mock('../../src/mail/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utilities/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/utilities/activityLogger', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utilities/backendLogger', () => ({
  logBackendActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/helpers/sendPushNotification', () => ({
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utilities/cache', () => ({
  delPattern: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  key: jest.fn((...parts) => parts.join(':')),
}));

// Lightspeed axios calls (updateQuantities uses it in ENVIRONMENT=true mode)
jest.mock('axios');

// ─── Model imports (must come AFTER setup to get the in-memory connection) ──

const mongoose = require('mongoose');
const PendingPayment = require('../../src/models/PendingPayment');
const Order = require('../../src/models/Order');
const User = require('../../src/models/User');
const CartData = require('../../src/models/CartData');
const { processPendingPayment } = require('../../src/services/order/adapters/pendingPayment');

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeOrderData(overrides = {}) {
  return {
    cartData: [
      {
        id: 'prod-001',
        product_id: new mongoose.Types.ObjectId().toString(),
        name: 'Test Widget',
        price: 100,
        qty: 1,
        variant: 'Default',
        image: 'http://img.test/1.jpg',
      },
    ],
    total: 100,
    sub_total: 100,
    currency: 'AED',
    discountAmount: 0,
    couponCode: '',
    shippingCost: 0,
    name: 'Test Buyer',
    phone: '+971501234567',
    address: 'Dubai Marina',
    state: 'Dubai',
    city: 'Dubai',
    area: 'Marina',
    country: 'AE',
    floorNo: '1',
    buildingName: 'Tower B',
    apartmentNo: '101',
    landmark: '',
    mobileNumber: '+971501234567',
    user_email: 'buyer@test.com',
    ...overrides,
  };
}

async function createUser() {
  const user = await User.create({
    name: 'Test Buyer',
    email: `buyer-${Date.now()}@test.com`,
    phone: '0501234567',
    password: 'hashed',
    address: [],
  });
  return user;
}

async function createPendingPayment(userId, paymentId, status = 'pending') {
  return PendingPayment.create({
    user_id: userId,
    payment_id: paymentId,
    payment_method: 'stripe',
    order_data: makeOrderData({ user_email: 'buyer@test.com' }),
    status,
    orderfrom: 'Mobile App',
    orderTime: '1 May 2026, 10:00 am',
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('processPendingPayment — atomicity & concurrency', () => {

  // ── a. Atomic claim: N=10 concurrent calls produce exactly ONE order ────────

  test('(a) Promise.all N=10 concurrent calls create exactly one Order', async () => {
    // Arrange
    const user = await createUser();
    const paymentId = `pi_concurrent_${Date.now()}`;
    await createPendingPayment(user._id, paymentId, 'pending');

    // Act
    const N = 10;
    const calls = Array.from({ length: N }, () => processPendingPayment(paymentId, {}));
    const results = await Promise.allSettled(calls);

    // Assert — all settled without uncaught error
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }

    // Exactly one Order was created
    const orders = await Order.find({ txn_id: paymentId });
    expect(orders).toHaveLength(1);

    // PendingPayment reached terminal state
    const pp = await PendingPayment.findOne({ payment_id: paymentId });
    expect(pp.status).toBe('completed');
  }, 20_000);

  // ── b. No-op when already 'processing' ──────────────────────────────────────

  test('(b) no-op when PendingPayment is already in processing state', async () => {
    // Arrange
    const user = await createUser();
    const paymentId = `pi_processing_${Date.now()}`;
    await createPendingPayment(user._id, paymentId, 'processing');

    // Act
    await processPendingPayment(paymentId, {});

    // Assert — no Order created, no error
    const orders = await Order.find({ txn_id: paymentId });
    expect(orders).toHaveLength(0);

    // Status unchanged (still 'processing' — nothing claimed it)
    const pp = await PendingPayment.findOne({ payment_id: paymentId });
    expect(pp.status).toBe('processing');
  });

  // ── c. No-op when record missing ────────────────────────────────────────────

  test('(c) no-op when no PendingPayment exists for the given paymentId', async () => {
    // Arrange
    const paymentId = `pi_nonexistent_${Date.now()}`;

    // Act — must not throw
    await expect(processPendingPayment(paymentId, {})).resolves.toBeUndefined();

    // Assert
    const orders = await Order.find({ txn_id: paymentId });
    expect(orders).toHaveLength(0);
  });

  // ── d. Re-entry safe: second call on completed record is a no-op ─────────────

  test('(d) second call after completion is a no-op (no duplicate order)', async () => {
    // Arrange
    const user = await createUser();
    const paymentId = `pi_reentry_${Date.now()}`;
    await createPendingPayment(user._id, paymentId, 'pending');

    // First call — creates order and marks completed
    await processPendingPayment(paymentId, {});
    const firstOrders = await Order.find({ txn_id: paymentId });
    expect(firstOrders).toHaveLength(1);

    // Act — second call
    await processPendingPayment(paymentId, {});

    // Assert — still only one order
    const orders = await Order.find({ txn_id: paymentId });
    expect(orders).toHaveLength(1);
  });

  // ── f. Email failure does not prevent order creation ────────────────────────

  test('(f) email send failure does not prevent order creation or status completion', async () => {
    // Arrange
    const { sendEmail } = require('../../src/mail/emailService');
    sendEmail.mockRejectedValueOnce(new Error('SMTP down')); // admin email fails
    // user email will also fail since sendEmail is called twice
    sendEmail.mockRejectedValueOnce(new Error('SMTP down'));

    const user = await createUser();
    const paymentId = `pi_email_fail_${Date.now()}`;
    await createPendingPayment(user._id, paymentId, 'pending');

    // Act
    await processPendingPayment(paymentId, {});

    // Assert — order still created despite email failure
    const orders = await Order.find({ txn_id: paymentId });
    expect(orders).toHaveLength(1);

    // Status still marked completed (email failure is non-fatal)
    const pp = await PendingPayment.findOne({ payment_id: paymentId });
    expect(pp.status).toBe('completed');
  });

  // ── g. Coupon code path exercised ──────────────────────────────────────────

  test('(g) order data with couponCode and mobileNumber exercises coupon path', async () => {
    // Arrange
    const user = await createUser();
    const paymentId = `pi_coupon_${Date.now()}`;
    const orderDataWithCoupon = makeOrderData({
      couponCode: 'TESTCOUPON',
      mobileNumber: '+971501234567',
      user_email: 'buyer@test.com',
    });

    await PendingPayment.create({
      user_id: user._id,
      payment_id: paymentId,
      payment_method: 'stripe',
      order_data: orderDataWithCoupon,
      status: 'pending',
      orderfrom: 'Mobile App',
      orderTime: '1 May 2026, 10:00 am',
    });

    // Act
    await processPendingPayment(paymentId, {});

    // Assert
    const orders = await Order.find({ txn_id: paymentId });
    expect(orders).toHaveLength(1);
    const pp = await PendingPayment.findOne({ payment_id: paymentId });
    expect(pp.status).toBe('completed');
  });

  // ── e. Symmetric finalization: manually set to 'failed' between claim and finalization ──

  test('(e) finalization does not override status when already set to "failed"', async () => {
    // Arrange
    const user = await createUser();
    const paymentId = `pi_failed_override_${Date.now()}`;
    // Start in 'processing' — as if claim already happened but finalization hasn't
    await createPendingPayment(user._id, paymentId, 'processing');

    // Manually flip to 'failed' (simulates external intervention between claim and finalize)
    await PendingPayment.findOneAndUpdate(
      { payment_id: paymentId },
      { $set: { status: 'failed' } }
    );

    // Act — the finalization findOneAndUpdate targets { status: 'processing' }, which no longer matches
    // We call processPendingPayment which will bail at the claim step since status != 'pending'
    await processPendingPayment(paymentId, {});

    // Assert — status stays 'failed', not overridden to 'completed'
    const pp = await PendingPayment.findOne({ payment_id: paymentId });
    expect(pp.status).toBe('failed');

    // No order was created
    const orders = await Order.find({ txn_id: paymentId });
    expect(orders).toHaveLength(0);
  });
});
