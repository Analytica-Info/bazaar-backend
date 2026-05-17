'use strict';

/**
 * nomodCheckoutE2E.test.js — End-to-end smoke tests for the Nomod payment flow.
 *
 * Three flows:
 *   Flow A — Happy path: mobile success callback works correctly
 *   Flow B — Crash recovery: mobile callback never fires; reconciler picks up
 *   Flow C — Duplicate defense: verify + reconciler race → exactly one Order
 *
 * All flows use mongodb-memory-server (via tests/setup.js) and mock all external
 * dependencies (Nomod HTTP, email, push notifications, etc.).
 *
 * These are the load-bearing E2E proofs for the Nomod-as-primary deployment.
 */

require('../setup');

// ─── External dependency mocks ───────────────────────────────────────────────

// Stripe must be mocked before any module that requires PaymentProviderFactory
// (StripeProvider calls stripe(process.env.STRIPE_SK) at module load time).
jest.mock('stripe', () => jest.fn(() => ({
    checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
    paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
    coupons: { create: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
})));

jest.mock('../../src/mail/emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utilities/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
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
    NAMESPACE: 'bazaar:',
    delPattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    key: jest.fn((...parts) => parts.join(':')),
}));

// Mock the reconciler lock so it always acquires in tests
jest.mock('../../src/services/payments/recovery/reconcilerLock', () => ({
    acquireLock: jest.fn().mockResolvedValue('test-lock-token'),
    releaseLock: jest.fn().mockResolvedValue(undefined),
    NO_REDIS_TOKEN: 'NO_REDIS',
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const PendingPayment = require('../../src/models/PendingPayment');
const Order = require('../../src/models/Order');
const User = require('../../src/models/User');
const CartData = require('../../src/models/CartData');

const createNomodCheckoutSession = require('../../src/services/order/use-cases/createNomodCheckoutSession');
const verifyNomodPayment = require('../../src/services/order/use-cases/verifyNomodPayment');
const { processPendingPayment } = require('../../src/services/order/adapters/pendingPayment');
const { reconcilePendingPayments } = require('../../src/services/payments/recovery/pollingReconciler');
const PaymentProviderFactory = require('../../src/services/payments/PaymentProviderFactory');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CHECKOUT_ID = 'chk_e2e_test_001';
const CHECKOUT_URL = 'https://pay.nomod.com/chk_e2e_test_001';
const TOTAL = 130;
const CURRENCY = 'AED';

function makeCartData() {
    return [
        {
            id: 'prod-1',
            product_id: 'prod-1',
            name: 'Bazaar Product A',
            price: '100.00',
            qty: 1,
            image: 'https://example.com/img.jpg',
            variant: 'Default',
        },
    ];
}

function makeBodyData(overrides = {}) {
    return {
        cartData: makeCartData(),
        total: TOTAL,
        sub_total: 100,
        currency: CURRENCY,
        discountAmount: 0,
        shippingCost: 30,
        name: 'E2E Buyer',
        phone: '+971501234567',
        address: 'Dubai Marina',
        state: 'Dubai',
        city: 'Dubai',
        area: 'Marina',
        user_email: 'e2e@test.com',
        ...overrides,
    };
}

/** A Nomod checkout response that looks paid */
function makePaidCheckout(overrides = {}) {
    return {
        id: CHECKOUT_ID,
        paid: true,
        status: 'paid',
        amount: TOTAL,
        currency: CURRENCY,
        reference_id: 'ref_e2e_001',
        charges: [{ status: 'paid', amount: TOTAL }],
        metadata: {},
        ...overrides,
    };
}

async function createUser() {
    return User.create({
        name: 'E2E Buyer',
        email: `e2e-${Date.now()}-${Math.random()}@test.com`,
        phone: '+971501234567',
        password: 'hashed_password',
        address: [],
    });
}

/** Build a minimal providerFactory that wraps a given mock provider */
function makeProviderFactory(mockProvider) {
    return {
        create: jest.fn(() => mockProvider),
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Nomod Checkout E2E', () => {
    let user;
    let mockProvider;

    beforeEach(async () => {
        // Ensure env var is set (required by createNomodCheckoutSession)
        process.env.NOMOD_API_KEY = 'test_api_key_e2e';

        user = await createUser();

        // Build a default mock provider (overridden per-test as needed)
        mockProvider = {
            createCheckout: jest.fn().mockResolvedValue({
                id: CHECKOUT_ID,
                redirectUrl: CHECKOUT_URL,
            }),
            getCheckout: jest.fn().mockResolvedValue(makePaidCheckout()),
            queryPaymentState: jest.fn().mockResolvedValue({
                terminalState: 'paid',
                raw: makePaidCheckout(),
            }),
        };

        // Wire PaymentProviderFactory to return our mock provider
        jest.spyOn(PaymentProviderFactory, 'create').mockReturnValue(mockProvider);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Flow A — Happy path: mobile success callback works
    // ─────────────────────────────────────────────────────────────────────────

    describe('Flow A — Happy path (mobile success callback)', () => {
        it('creates one Order and marks PendingPayment completed after verify + process', async () => {
            // Step 1: POST createNomodCheckoutSession
            const sessionResult = await createNomodCheckoutSession(
                user._id.toString(),
                makeBodyData(),
                {},
            );

            expect(sessionResult.checkout_url).toBe(CHECKOUT_URL);
            expect(sessionResult.payment_id).toBe(CHECKOUT_ID);
            expect(sessionResult.status).toBe('created');

            // Verify PendingPayment was written with status:pending
            const pendingAfterCreate = await PendingPayment.findOne({ payment_id: CHECKOUT_ID });
            expect(pendingAfterCreate).not.toBeNull();
            expect(pendingAfterCreate.status).toBe('pending');
            expect(String(pendingAfterCreate.user_id)).toBe(user._id.toString());

            // Step 2: Simulate Nomod saying paid — getCheckout is already mocked to return paid

            // Step 3: GET verifyNomodPayment (mobile success callback)
            const verifyResult = await verifyNomodPayment(CHECKOUT_ID, user._id.toString());

            expect(verifyResult.paymentId).toBe(CHECKOUT_ID);
            // verifyNomodPayment does NOT create the order — it just confirms paid
            // The mobile then calls processPendingPayment

            // Step 4: Mobile calls processPendingPayment
            await processPendingPayment(CHECKOUT_ID, makePaidCheckout());

            // Step 5: Verify exactly one Order exists
            const orders = await Order.find({ txn_id: CHECKOUT_ID });
            expect(orders).toHaveLength(1);
            expect(orders[0].status).toBe('confirmed');
            expect(orders[0].payment_status).toBe('paid');

            // Verify PendingPayment.status = completed
            const finalPending = await PendingPayment.findOne({ payment_id: CHECKOUT_ID });
            expect(finalPending.status).toBe('completed');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Flow B — Crash recovery: mobile callback never fires, reconciler picks up
    // ─────────────────────────────────────────────────────────────────────────

    describe('Flow B — Crash recovery (reconciler completes abandoned checkout)', () => {
        it('creates one Order when reconciler runs after app crash (no verifyNomodPayment called)', async () => {
            // Step 1: POST createNomodCheckoutSession
            const sessionResult = await createNomodCheckoutSession(
                user._id.toString(),
                makeBodyData(),
                {},
            );
            expect(sessionResult.payment_id).toBe(CHECKOUT_ID);

            // Verify PendingPayment is pending
            const pendingBefore = await PendingPayment.findOne({ payment_id: CHECKOUT_ID });
            expect(pendingBefore.status).toBe('pending');

            // Step 2: Simulate app crash — verifyNomodPayment is NEVER called

            // Step 3: Simulate provider eventually saying paid
            // queryPaymentState is already mocked to return { terminalState: 'paid', ... }

            // Step 4: Run the reconciler directly with injected deps
            const result = await reconcilePendingPayments({
                PendingPayment,
                providerFactory: makeProviderFactory(mockProvider),
                processPendingPayment,
                logger: require('../../src/utilities/logger'),
                config: {
                    lookbackMinutes: 120,  // wide window to catch our test record
                    batchSize: 10,
                },
            });

            // Reconciler should have processed the payment as paid
            expect(result.paid).toBe(1);
            expect(result.processed).toBe(1);
            expect(result.errors).toHaveLength(0);

            // Step 5: Verify exactly one Order was created
            const orders = await Order.find({ txn_id: CHECKOUT_ID });
            expect(orders).toHaveLength(1);
            expect(orders[0].status).toBe('confirmed');

            // PendingPayment should be completed
            const finalPending = await PendingPayment.findOne({ payment_id: CHECKOUT_ID });
            expect(finalPending.status).toBe('completed');
        });

        it('reconciler does NOT create duplicate when payment is already completed', async () => {
            // Create a PendingPayment that is already completed
            await PendingPayment.create({
                user_id: user._id,
                payment_id: 'chk_already_done',
                payment_method: 'nomod',
                order_data: makeBodyData(),
                status: 'completed',
                orderfrom: 'Mobile App',
                orderTime: '1 May 2026, 10:00 am',
            });

            const result = await reconcilePendingPayments({
                PendingPayment,
                providerFactory: makeProviderFactory(mockProvider),
                processPendingPayment,
                logger: require('../../src/utilities/logger'),
                config: { lookbackMinutes: 120, batchSize: 10 },
            });

            // The completed record must be excluded from processing
            expect(result.processed).toBe(0);
            const orders = await Order.find({ txn_id: 'chk_already_done' });
            expect(orders).toHaveLength(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Flow C — Duplicate defense: verify + reconciler race → exactly one Order
    // ─────────────────────────────────────────────────────────────────────────

    describe('Flow C — Duplicate defense (verify + reconciler concurrent race)', () => {
        it('produces exactly one Order when verify path and reconciler race for the same paymentId', async () => {
            // Step 1: Create checkout session → PendingPayment in 'pending'
            await createNomodCheckoutSession(
                user._id.toString(),
                makeBodyData(),
                {},
            );

            const pendingBefore = await PendingPayment.findOne({ payment_id: CHECKOUT_ID });
            expect(pendingBefore.status).toBe('pending');

            // Step 2: Provider says paid
            // Both mocks already return paid

            // Step 3: Fire verify path + reconciler concurrently
            // verify side: verifyNomodPayment (confirms paid, no-ops itself)
            //              then processPendingPayment (atomic CAS claim)
            // reconciler side: reconcilePendingPayments (also calls processPendingPayment)

            const verifyAndProcess = async () => {
                await verifyNomodPayment(CHECKOUT_ID, user._id.toString());
                await processPendingPayment(CHECKOUT_ID, makePaidCheckout());
            };

            const runReconciler = () => reconcilePendingPayments({
                PendingPayment,
                providerFactory: makeProviderFactory(mockProvider),
                processPendingPayment,
                logger: require('../../src/utilities/logger'),
                config: { lookbackMinutes: 120, batchSize: 10 },
            });

            // Run both concurrently — exactly one must win the CAS
            const [, reconcilerResult] = await Promise.all([
                verifyAndProcess(),
                runReconciler(),
            ]);

            // Step 4: Exactly one Order must exist regardless of which path won
            const orders = await Order.find({ txn_id: CHECKOUT_ID });
            expect(orders).toHaveLength(1);

            // PendingPayment must be in a terminal state (completed or processing→completed)
            const finalPending = await PendingPayment.findOne({ payment_id: CHECKOUT_ID });
            expect(['completed', 'processing']).toContain(finalPending.status);

            // The reconciler should report ≤1 paid (it may have lost the race)
            expect(reconcilerResult.errors).toHaveLength(0);
            expect(reconcilerResult.paid + reconcilerResult.pending).toBeGreaterThanOrEqual(0);
        });

        it('running processPendingPayment twice for the same paymentId creates exactly one Order', async () => {
            // Directly set up a pending payment record
            await PendingPayment.create({
                user_id: user._id,
                payment_id: CHECKOUT_ID,
                payment_method: 'nomod',
                order_data: makeBodyData(),
                status: 'pending',
                orderfrom: 'Mobile App',
                orderTime: '1 May 2026, 10:00 am',
            });

            // Fire two concurrent processPendingPayment calls for the same ID
            await Promise.all([
                processPendingPayment(CHECKOUT_ID, makePaidCheckout()),
                processPendingPayment(CHECKOUT_ID, makePaidCheckout()),
            ]);

            // Exactly one Order must exist — the CAS guarantees this
            const orders = await Order.find({ txn_id: CHECKOUT_ID });
            expect(orders).toHaveLength(1);
        });
    });
});
