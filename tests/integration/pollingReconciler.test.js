'use strict';

/**
 * Integration tests: pollingReconciler + reconcilerLock + NomodProvider.queryPaymentState
 *
 * Uses mongodb-memory-server (via tests/setup.js) for real Mongoose operations.
 * All external dependencies are mocked — the focus is on reconciler behaviour,
 * atomicity, and idempotency.
 *
 * Test plan (scenarios a–k as specified in the wave-4 brief):
 *   a. Happy path — paid
 *   b. Cancelled
 *   c. Expired
 *   d. Still pending (provider says pending)
 *   e. Unknown state
 *   f. Lock not acquired
 *   g. Lookback window filters old records
 *   h. Batch size cap
 *   i. Per-record error doesn't abort the batch
 *   j. Concurrent reconciler + webhook for same paymentId → exactly one Order
 *   k. Idempotency — running twice produces exactly one Order
 *
 * Plus unit tests for:
 *   - reconcilerLock acquire/release semantics
 *   - NomodProvider.queryPaymentState mapping
 */

require('../setup');

// ─── External dependency mocks ───────────────────────────────────────────────

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

jest.mock('axios');

// ─── Imports ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const PendingPayment = require('../../src/models/PendingPayment');
const Order = require('../../src/models/Order');
const User = require('../../src/models/User');
const CartData = require('../../src/models/CartData');

const { reconcilePendingPayments } = require('../../src/services/payments/recovery/pollingReconciler');
const { processPendingPayment } = require('../../src/services/order/adapters/pendingPayment');
const NomodProvider = require('../../src/services/payments/NomodProvider');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrderData(overrides = {}) {
    return {
        cartData: [
            {
                id: 'prod-1',
                product_id: 'prod-1',
                name: 'Test Product',
                price: '50.00',
                qty: 1,
                image: 'https://example.com/img.jpg',
                variant: 'Default',
            },
        ],
        sub_total: 50,
        total: 50,
        discountAmount: 0,
        shippingCost: 0,
        name: 'Test Buyer',
        user_email: 'buyer@test.com',
        address: '123 Test St',
        state: 'Dubai',
        phone: '+971501234567',
        ...overrides,
    };
}

async function createUser() {
    return User.create({
        name: 'Test Buyer',
        email: `buyer-${Date.now()}-${Math.random()}@test.com`,
        phone: '0501234567',
        password: 'hashed',
        address: [],
    });
}

async function createPendingPayment(userId, paymentId, overrides = {}) {
    return PendingPayment.create({
        user_id: userId,
        payment_id: paymentId,
        payment_method: 'nomod',
        order_data: makeOrderData(),
        status: 'pending',
        orderfrom: 'Mobile App',
        orderTime: '1 May 2026, 10:00 am',
        ...overrides,
    });
}

/** Build a minimal injected providerFactory that returns a mock provider */
function makeProviderFactory(queryPaymentStateFn) {
    return {
        create: jest.fn(() => ({
            queryPaymentState: queryPaymentStateFn,
        })),
    };
}

const mockLogger = require('../../src/utilities/logger');

// ─── Tests: reconcilePendingPayments ─────────────────────────────────────────

describe('reconcilePendingPayments', () => {
    let user;

    beforeEach(async () => {
        user = await createUser();
        jest.clearAllMocks();
    });

    // ── (a) Happy path — paid ────────────────────────────────────────────────

    test('(a) paid: calls processPendingPayment and counts paid:1', async () => {
        const paymentId = `nomod-a-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        const rawData = { status: 'paid' };
        const queryPaymentState = jest.fn().mockResolvedValue({ terminalState: 'paid', raw: rawData });
        const mockProcess = jest.fn().mockResolvedValue(undefined);

        const result = await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: mockProcess,
            logger: mockLogger,
        });

        expect(mockProcess).toHaveBeenCalledTimes(1);
        expect(mockProcess).toHaveBeenCalledWith(paymentId, rawData);
        expect(result.paid).toBe(1);
        expect(result.processed).toBe(1);
        expect(result.errors).toHaveLength(0);
    });

    // ── (b) Cancelled ────────────────────────────────────────────────────────

    test('(b) cancelled: updates PendingPayment status to cancelled, does not call processPendingPayment', async () => {
        const paymentId = `nomod-b-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        const queryPaymentState = jest.fn().mockResolvedValue({ terminalState: 'cancelled' });
        const mockProcess = jest.fn();

        const result = await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: mockProcess,
            logger: mockLogger,
        });

        expect(mockProcess).not.toHaveBeenCalled();
        expect(result.cancelled).toBe(1);

        const updated = await PendingPayment.findOne({ payment_id: paymentId });
        expect(updated.status).toBe('cancelled');
    });

    // ── (c) Expired ──────────────────────────────────────────────────────────

    test('(c) expired: updates PendingPayment status to expired, does not call processPendingPayment', async () => {
        const paymentId = `nomod-c-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        const queryPaymentState = jest.fn().mockResolvedValue({ terminalState: 'expired' });
        const mockProcess = jest.fn();

        const result = await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: mockProcess,
            logger: mockLogger,
        });

        expect(mockProcess).not.toHaveBeenCalled();
        expect(result.expired).toBe(1);

        const updated = await PendingPayment.findOne({ payment_id: paymentId });
        expect(updated.status).toBe('expired');
    });

    // ── (d) Still pending ────────────────────────────────────────────────────

    test('(d) pending: no DB writes, result.pending=1', async () => {
        const paymentId = `nomod-d-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        const queryPaymentState = jest.fn().mockResolvedValue({ terminalState: 'pending' });
        const mockProcess = jest.fn();

        const result = await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: mockProcess,
            logger: mockLogger,
        });

        expect(mockProcess).not.toHaveBeenCalled();
        expect(result.pending).toBe(1);

        // Status unchanged
        const rec = await PendingPayment.findOne({ payment_id: paymentId });
        expect(rec.status).toBe('pending');
    });

    // ── (e) Unknown ──────────────────────────────────────────────────────────

    test('(e) unknown: no DB writes, logs warn, result.pending=1', async () => {
        const paymentId = `nomod-e-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        const queryPaymentState = jest.fn().mockResolvedValue({ terminalState: 'unknown', reason: 'weird_response' });
        const mockProcess = jest.fn();

        const result = await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: mockProcess,
            logger: mockLogger,
        });

        expect(mockProcess).not.toHaveBeenCalled();
        expect(result.pending).toBe(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ paymentId, reason: 'weird_response' }),
            expect.any(String),
        );

        const rec = await PendingPayment.findOne({ payment_id: paymentId });
        expect(rec.status).toBe('pending');
    });

    // ── (f) Lock not acquired ────────────────────────────────────────────────

    test('(f) lock not acquired: returns {skipped} without touching DB', async () => {
        const paymentId = `nomod-f-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        // Temporarily mock reconcilerLock to refuse the lock by spying on the redis module
        const redisModule = require('../../src/config/redis');
        const isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(true);
        const mockClient = {
            // SET NX returns null → lock already held by another instance
            set: jest.fn().mockResolvedValue(null),
        };
        const getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(mockClient);

        const mockProcess = jest.fn();

        const result = await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(jest.fn().mockResolvedValue({ terminalState: 'pending' })),
            processPendingPayment: mockProcess,
            logger: mockLogger,
            config: { lockKey: 'reconciler:payment:lock:v1', lockTtlSeconds: 60 },
        });

        isEnabledSpy.mockRestore();
        getClientSpy.mockRestore();

        expect(result.skipped).toBe('lock-not-acquired');
        expect(mockProcess).not.toHaveBeenCalled();
    });

    // ── (g) Lookback window ───────────────────────────────────────────────────

    test('(g) lookback window: only processes records within window', async () => {
        const user2 = await createUser();
        const recentId = `nomod-g-recent-${Date.now()}`;
        const oldId = `nomod-g-old-${Date.now()}`;

        // Recent record (within lookback)
        await createPendingPayment(user._id, recentId);

        // Old record (outside lookback — createdAt 90 min ago)
        const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000);
        await PendingPayment.create({
            user_id: user2._id,
            payment_id: oldId,
            payment_method: 'nomod',
            order_data: makeOrderData(),
            status: 'pending',
            orderfrom: 'Mobile App',
            orderTime: '1 May 2026, 08:30 am',
            createdAt: ninetyMinsAgo,
        });

        const queryCalls = [];
        const queryPaymentState = jest.fn().mockImplementation((pid) => {
            queryCalls.push(pid);
            return Promise.resolve({ terminalState: 'cancelled' });
        });
        const mockProcess = jest.fn();

        await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: mockProcess,
            logger: mockLogger,
            config: { lookbackMinutes: 60 },
        });

        // Only the recent record should have been queried
        expect(queryCalls).toContain(recentId);
        expect(queryCalls).not.toContain(oldId);
    });

    // ── (h) Batch size cap ────────────────────────────────────────────────────

    test('(h) batchSize: processes at most batchSize records per tick', async () => {
        const ids = [];
        for (let i = 0; i < 10; i++) {
            const user2 = await createUser();
            const pid = `nomod-h-${Date.now()}-${i}`;
            ids.push(pid);
            await createPendingPayment(user2._id, pid);
        }

        const queryCalls = [];
        const queryPaymentState = jest.fn().mockImplementation((pid) => {
            queryCalls.push(pid);
            return Promise.resolve({ terminalState: 'pending' });
        });

        await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: jest.fn(),
            logger: mockLogger,
            config: { batchSize: 3 },
        });

        expect(queryCalls).toHaveLength(3);
    });

    // ── (i) Per-record error doesn't abort batch ───────────────────────────────

    test('(i) per-record error: continues processing remaining records', async () => {
        const user2 = await createUser();
        const user3 = await createUser();
        const id1 = `nomod-i-1-${Date.now()}`;
        const id2 = `nomod-i-2-${Date.now()}`;
        const id3 = `nomod-i-3-${Date.now()}`;

        // Create in order so the sort-by-createdAt is deterministic
        await createPendingPayment(user._id, id1);
        await new Promise((r) => setTimeout(r, 5));
        await createPendingPayment(user2._id, id2);
        await new Promise((r) => setTimeout(r, 5));
        await createPendingPayment(user3._id, id3);

        const queryPaymentState = jest.fn().mockImplementation((pid) => {
            if (pid === id2) throw new Error('provider_exploded');
            return Promise.resolve({ terminalState: 'cancelled' });
        });

        const result = await reconcilePendingPayments({
            PendingPayment,
            providerFactory: makeProviderFactory(queryPaymentState),
            processPendingPayment: jest.fn(),
            logger: mockLogger,
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].paymentId).toBe(id2);
        expect(result.cancelled).toBe(2); // id1 and id3 succeeded
        expect(result.processed).toBe(3); // all three attempted

        // id1 and id3 should be cancelled in DB
        const rec1 = await PendingPayment.findOne({ payment_id: id1 });
        const rec3 = await PendingPayment.findOne({ payment_id: id3 });
        expect(rec1.status).toBe('cancelled');
        expect(rec3.status).toBe('cancelled');
    });

    // ── (j) Concurrency: reconciler + simultaneous webhook → exactly one Order ──

    test('(j) concurrent reconciler + processPendingPayment: exactly one Order created', async () => {
        const paymentId = `nomod-j-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        // The provider says paid
        const queryPaymentState = jest.fn().mockResolvedValue({
            terminalState: 'paid',
            raw: { status: 'paid' },
        });

        // Fire reconciler AND a direct processPendingPayment call simultaneously
        await Promise.all([
            reconcilePendingPayments({
                PendingPayment,
                providerFactory: makeProviderFactory(queryPaymentState),
                processPendingPayment,
                logger: mockLogger,
            }),
            processPendingPayment(paymentId, {}),
        ]);

        // Exactly one Order must be created — atomicity invariant
        const orderCount = await Order.countDocuments({ txn_id: paymentId });
        expect(orderCount).toBe(1);
    });

    // ── (k) Idempotency ───────────────────────────────────────────────────────

    test('(k) idempotency: running reconciler twice creates exactly one Order', async () => {
        const paymentId = `nomod-k-${Date.now()}`;
        await createPendingPayment(user._id, paymentId);

        const queryPaymentState = jest.fn().mockResolvedValue({
            terminalState: 'paid',
            raw: { status: 'paid' },
        });

        const factory = makeProviderFactory(queryPaymentState);

        // First run — processes the record and creates the order
        await reconcilePendingPayments({
            PendingPayment,
            providerFactory: factory,
            processPendingPayment,
            logger: mockLogger,
        });

        // Second run — record is now completed/processing; should be a no-op
        await reconcilePendingPayments({
            PendingPayment,
            providerFactory: factory,
            processPendingPayment,
            logger: mockLogger,
        });

        // Still exactly one Order
        const orderCount = await Order.countDocuments({ txn_id: paymentId });
        expect(orderCount).toBe(1);
    });
});

// ─── Unit tests: reconcilerLock ──────────────────────────────────────────────
// These tests work directly with the lock module's internal logic by testing
// the exported functions after mocking redis at the module level.

describe('reconcilerLock', () => {
    const NO_REDIS_TOKEN = 'no-redis-single-instance';

    // We test by directly calling the functions and verifying behaviour
    // through a mock Redis client injected at the module level via jest.mock
    // (declared at the top of the file). Since we need per-test Redis behaviour,
    // we use a controllable spy on the redis module.

    const redisModule = require('../../src/config/redis');

    let isEnabledSpy;
    let getClientSpy;

    afterEach(() => {
        isEnabledSpy && isEnabledSpy.mockRestore();
        getClientSpy && getClientSpy.mockRestore();
    });

    test('returns NO_REDIS_TOKEN (always-acquired) when Redis is disabled', async () => {
        const { acquireLock, releaseLock } = require('../../src/services/payments/recovery/reconcilerLock');
        isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(false);
        getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(null);

        const token = await acquireLock('test:lock', 60);
        expect(token).toBe(NO_REDIS_TOKEN);

        // releaseLock with NO_REDIS_TOKEN should not throw
        await expect(releaseLock('test:lock', NO_REDIS_TOKEN)).resolves.toBeUndefined();
    });

    test('returns NO_REDIS_TOKEN when getClient returns null', async () => {
        const { acquireLock } = require('../../src/services/payments/recovery/reconcilerLock');
        isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(true);
        getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(null);

        const token = await acquireLock('test:lock', 60);
        expect(token).toBe(NO_REDIS_TOKEN);
    });

    test('acquires lock when Redis SET NX returns OK', async () => {
        const { acquireLock } = require('../../src/services/payments/recovery/reconcilerLock');

        const mockClient = {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn(),
            del: jest.fn(),
        };
        isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(true);
        getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(mockClient);

        const token = await acquireLock('test:lock', 60);

        expect(token).toBeTruthy();
        expect(typeof token).toBe('string');
        expect(mockClient.set).toHaveBeenCalledWith(
            expect.stringContaining('test:lock'),
            token,
            'NX',
            'EX',
            60,
        );
    });

    test('returns null when lock is already held (SET NX returns null)', async () => {
        const { acquireLock } = require('../../src/services/payments/recovery/reconcilerLock');

        const mockClient = { set: jest.fn().mockResolvedValue(null) };
        isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(true);
        getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(mockClient);

        const token = await acquireLock('test:lock', 60);
        expect(token).toBeNull();
    });

    test('releaseLock deletes key only when token matches', async () => {
        const { releaseLock } = require('../../src/services/payments/recovery/reconcilerLock');
        const storedToken = 'abc-123';
        const mockClient = {
            get: jest.fn().mockResolvedValue(storedToken),
            del: jest.fn().mockResolvedValue(1),
        };
        isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(true);
        getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(mockClient);

        await releaseLock('test:lock', storedToken);
        expect(mockClient.del).toHaveBeenCalledWith(expect.stringContaining('test:lock'));
    });

    test('releaseLock does NOT delete key when token is stale', async () => {
        const { releaseLock } = require('../../src/services/payments/recovery/reconcilerLock');
        const mockClient = {
            get: jest.fn().mockResolvedValue('different-token'),
            del: jest.fn(),
        };
        isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(true);
        getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(mockClient);

        await releaseLock('test:lock', 'my-token');
        expect(mockClient.del).not.toHaveBeenCalled();
    });

    test('acquireLock falls back to NO_REDIS_TOKEN on Redis error', async () => {
        const { acquireLock } = require('../../src/services/payments/recovery/reconcilerLock');
        const mockClient = { set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
        isEnabledSpy = jest.spyOn(redisModule, 'isEnabled').mockReturnValue(true);
        getClientSpy = jest.spyOn(redisModule, 'getClient').mockReturnValue(mockClient);

        const token = await acquireLock('test:lock', 60);
        expect(token).toBe(NO_REDIS_TOKEN);
    });
});

// ─── Unit tests: NomodProvider.queryPaymentState ─────────────────────────────

describe('NomodProvider.queryPaymentState', () => {
    let provider;

    beforeEach(() => {
        process.env.NOMOD_API_KEY = 'test-key';
        provider = new NomodProvider();
    });

    afterEach(() => {
        delete process.env.NOMOD_API_KEY;
        jest.restoreAllMocks();
    });

    function mockGetCheckout(returnValue) {
        jest.spyOn(provider, 'getCheckout').mockResolvedValue(returnValue);
    }

    function mockGetCheckoutError(error) {
        jest.spyOn(provider, 'getCheckout').mockRejectedValue(error);
    }

    test('paid with full charges → terminalState: paid', async () => {
        mockGetCheckout({
            status: 'paid',
            amount: 100,
            charges: [{ id: 'ch1', amount: 100, status: 'paid' }],
            raw: { status: 'paid' },
        });

        const result = await provider.queryPaymentState('checkout-123');
        expect(result.terminalState).toBe('paid');
        expect(result.raw).toBeDefined();
    });

    test('paid but partial settlement → terminalState: pending', async () => {
        mockGetCheckout({
            status: 'paid',
            amount: 100,
            charges: [{ id: 'ch1', amount: 50, status: 'paid' }],
            raw: { status: 'paid' },
        });

        const result = await provider.queryPaymentState('checkout-123');
        expect(result.terminalState).toBe('pending');
        expect(result.reason).toBe('partial_settlement');
    });

    test('cancelled → terminalState: cancelled', async () => {
        mockGetCheckout({ status: 'cancelled', amount: 100, charges: [], raw: {} });
        const result = await provider.queryPaymentState('checkout-123');
        expect(result.terminalState).toBe('cancelled');
    });

    test('expired → terminalState: expired', async () => {
        mockGetCheckout({ status: 'expired', amount: 100, charges: [], raw: {} });
        const result = await provider.queryPaymentState('checkout-123');
        expect(result.terminalState).toBe('expired');
    });

    test('created (still active) → terminalState: pending', async () => {
        mockGetCheckout({ status: 'created', amount: 100, charges: [], raw: {} });
        const result = await provider.queryPaymentState('checkout-123');
        expect(result.terminalState).toBe('pending');
    });

    test('404 from Nomod → terminalState: expired', async () => {
        mockGetCheckoutError({ status: 404, message: 'Checkout not found' });
        const result = await provider.queryPaymentState('missing-checkout');
        expect(result.terminalState).toBe('expired');
        expect(result.reason).toBe('checkout_not_found');
    });

    test('provider error (non-404) → terminalState: unknown', async () => {
        mockGetCheckoutError({ status: 500, message: 'internal server error' });
        const result = await provider.queryPaymentState('checkout-abc');
        expect(result.terminalState).toBe('unknown');
        expect(result.reason).toBe('internal server error');
    });

    test('paid with zero expected amount (edge case) → terminalState: paid', async () => {
        // When expectedAmount is 0 the partial-settlement guard is skipped
        mockGetCheckout({
            status: 'paid',
            amount: 0,
            charges: [],
            raw: { status: 'paid' },
        });
        const result = await provider.queryPaymentState('checkout-zero');
        expect(result.terminalState).toBe('paid');
    });

    test('authorised charges count toward total for partial-settlement check', async () => {
        mockGetCheckout({
            status: 'paid',
            amount: 100,
            charges: [
                { id: 'ch1', amount: 60, status: 'authorised' },
                { id: 'ch2', amount: 40, status: 'paid' },
            ],
            raw: { status: 'paid' },
        });
        const result = await provider.queryPaymentState('checkout-authorised');
        expect(result.terminalState).toBe('paid');
    });
});
