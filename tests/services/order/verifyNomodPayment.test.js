'use strict';

/**
 * Tests for src/services/order/use-cases/verifyNomodPayment.js
 *
 * All external dependencies are mocked so no real HTTP calls or DB writes occur.
 * Follows the AAA pattern and covers the 9 scenarios listed in Wave 2 deliverable 5.
 */

// --- module-level mocks (hoisted before any require) ---

jest.mock('../../../src/services/payments/PaymentProviderFactory', () => ({
  create: jest.fn(),
}));

const mockPendingPaymentModel = {
  findOne: jest.fn(),
};

jest.mock('../../../src/repositories', () => ({
  pendingPayments: { rawModel: () => mockPendingPaymentModel },
}));

jest.mock('../../../src/utilities/backendLogger', () => ({
  logBackendActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utilities/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const PaymentProviderFactory = require('../../../src/services/payments/PaymentProviderFactory');
const { logBackendActivity } = require('../../../src/utilities/backendLogger');
const verifyNomodPayment = require('../../../src/services/order/use-cases/verifyNomodPayment');

// --- helpers ---

const PAYMENT_ID = 'chk_test_abc123';
const USER_ID = 'user_aaaaa';
const OTHER_USER_ID = 'user_bbbbb';
const TOTAL = 99.99;
const CURRENCY = 'AED';

/** Build a minimal PendingPayment stub */
function buildPending({
  userId = USER_ID,
  total = TOTAL,
  currency = CURRENCY,
} = {}) {
  return {
    user_id: userId,
    order_data: { total, currency },
  };
}

/** Build a minimal Nomod checkout stub */
function buildCheckout({
  paid = true,
  status = 'paid',
  amount = TOTAL,
  currency = CURRENCY,
  charges = [{ id: 'ch_1', amount: TOTAL, status: 'paid', payment_time: '2026-01-01T00:00:00Z', payment_method: 'card' }],
  reference_id = 'ref_xyz',
} = {}) {
  return { paid, status, amount, currency, charges, reference_id, id: PAYMENT_ID };
}

/** Wire the mock provider's getCheckout to return the given checkout */
function setProvider(checkout) {
  PaymentProviderFactory.create.mockReturnValue({
    getCheckout: jest.fn().mockResolvedValue(checkout),
  });
}

/** Wire mockPendingPaymentModel.findOne to return the given pending (or null) */
function setPending(pending) {
  mockPendingPaymentModel.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(pending),
    }),
  });
}

// --- test setup ---

beforeEach(() => {
  jest.clearAllMocks();
  // Default: valid provider + matching pending record
  setProvider(buildCheckout());
  setPending(buildPending());
});

// ─── a) Auth required ─────────────────────────────────────────────────────────

describe('a) Auth required — missing requestingUserId', () => {
  test('throws 401 when requestingUserId is undefined', async () => {
    await expect(verifyNomodPayment(PAYMENT_ID, undefined)).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  test('throws 401 when requestingUserId is null', async () => {
    await expect(verifyNomodPayment(PAYMENT_ID, null)).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  test('throws 401 when requestingUserId is empty string', async () => {
    await expect(verifyNomodPayment(PAYMENT_ID, '')).rejects.toMatchObject({
      status: 401,
      message: 'Authentication required',
    });
  });

  test('does NOT call provider when auth fails', async () => {
    await expect(verifyNomodPayment(PAYMENT_ID, null)).rejects.toBeDefined();
    expect(PaymentProviderFactory.create).not.toHaveBeenCalled();
  });
});

// ─── b) Auth wrong user ───────────────────────────────────────────────────────

describe('b) Auth wrong user — PendingPayment belongs to different user', () => {
  test('throws 403 when user_id does not match requestingUserId', async () => {
    setPending(buildPending({ userId: OTHER_USER_ID }));
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
      message: 'Not authorized to verify this payment',
    });
  });

  test('does NOT call getCheckout when user is wrong', async () => {
    setPending(buildPending({ userId: OTHER_USER_ID }));
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toBeDefined();
    expect(PaymentProviderFactory.create).not.toHaveBeenCalled();
  });
});

// ─── c) PendingPayment not found ──────────────────────────────────────────────

describe('c) PendingPayment not found', () => {
  test('throws 404 when no PendingPayment record exists for this paymentId', async () => {
    setPending(null);
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('not found'),
    });
  });

  test('the 404 is thrown AFTER user authorization passes (no existence leak)', async () => {
    // If the 403 were checked first, we'd leak existence. The 404 path here
    // means authorization already passed (matching userId scenario is N/A for
    // null pending — we treat null pending as 404 only AFTER auth passes).
    setPending(null);
    // With correct userId, get 404
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toMatchObject({ status: 404 });
  });
});

// ─── d) Amount mismatch ───────────────────────────────────────────────────────

describe('d) Amount mismatch', () => {
  test('throws 400 AMOUNT_MISMATCH when checkout.amount differs from pending.total', async () => {
    setProvider(buildCheckout({ amount: 50.00 })); // pending.total = 99.99
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toMatchObject({
      status: 400,
      code: 'AMOUNT_MISMATCH',
    });
  });

  test('calls logBackendActivity on amount mismatch (security event)', async () => {
    setProvider(buildCheckout({ amount: 50.00 }));
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toBeDefined();
    expect(logBackendActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    );
  });
});

// ─── e) Currency mismatch ─────────────────────────────────────────────────────

describe('e) Currency mismatch', () => {
  test('throws 400 AMOUNT_MISMATCH when checkout.currency differs from pending currency', async () => {
    setProvider(buildCheckout({ currency: 'USD' })); // pending.currency = 'AED'
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toMatchObject({
      status: 400,
      code: 'AMOUNT_MISMATCH',
    });
  });

  test('currency comparison is case-insensitive', async () => {
    setProvider(buildCheckout({ currency: 'aed' })); // pending.currency = 'AED'
    // Should NOT throw — same currency, different case
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.message).toBeDefined();
  });

  test('calls logBackendActivity on currency mismatch', async () => {
    setProvider(buildCheckout({ currency: 'USD' }));
    await expect(verifyNomodPayment(PAYMENT_ID, USER_ID)).rejects.toBeDefined();
    expect(logBackendActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    );
  });
});

// ─── f) Happy path with charges array ────────────────────────────────────────

describe('f) Happy path — checkout.paid=true, charges=[{status:paid, amount:total}]', () => {
  test('returns success response without finalStatus', async () => {
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.message).toBeDefined();
    expect(result.finalStatus).toBeUndefined();
  });

  test('response includes additive fields: paymentId, amount, currency, chargesPaid, referenceId', async () => {
    const checkout = buildCheckout();
    setProvider(checkout);
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);

    expect(result.paymentId).toBe(PAYMENT_ID);
    expect(result.amount).toBe(Number(checkout.amount).toFixed(2));
    expect(result.currency).toBe('AED');
    expect(result.chargesPaid).toBe(1);
    expect(result.referenceId).toBe('ref_xyz');
  });
});

// ─── g) Charges total mismatch ────────────────────────────────────────────────

describe('g) Charges total mismatch — checkout.paid=true but charges sum less than expected', () => {
  test('returns finalStatus=partial, NOT success', async () => {
    setProvider(buildCheckout({
      paid: true,
      status: 'paid',
      amount: TOTAL,
      charges: [{ id: 'ch_1', amount: 50.00, status: 'paid' }], // only 50 of 99.99
    }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.finalStatus).toBe('partial');
  });

  test('partial result still includes additive fields', async () => {
    setProvider(buildCheckout({
      paid: true,
      amount: TOTAL,
      charges: [{ id: 'ch_1', amount: 50.00, status: 'paid' }],
    }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.paymentId).toBe(PAYMENT_ID);
    expect(result.chargesPaid).toBe(1);
  });
});

// ─── h) Empty charges array (legacy fallback) ─────────────────────────────────

describe('h) Empty charges array — legacy checkout.paid=true, charges=[]', () => {
  test('treats as fully paid (no regression for existing traffic)', async () => {
    setProvider(buildCheckout({ paid: true, charges: [] }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.finalStatus).toBeUndefined();
    expect(result.message).toBeDefined();
  });

  test('chargesPaid is 0 for empty charges', async () => {
    setProvider(buildCheckout({ paid: true, charges: [] }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.chargesPaid).toBe(0);
  });
});

// ─── i) Non-paid status ───────────────────────────────────────────────────────

describe('i) Non-paid status — checkout.paid=false', () => {
  test('returns finalStatus matching checkout status for cancelled', async () => {
    setProvider(buildCheckout({ paid: false, status: 'cancelled', charges: [] }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.finalStatus).toBe('cancelled');
  });

  test('returns finalStatus for expired', async () => {
    setProvider(buildCheckout({ paid: false, status: 'expired', charges: [] }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.finalStatus).toBe('expired');
  });

  test('returns finalStatus for created/pending', async () => {
    setProvider(buildCheckout({ paid: false, status: 'created', charges: [] }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.finalStatus).toBe('created');
  });

  test('non-paid response includes additive fields', async () => {
    setProvider(buildCheckout({ paid: false, status: 'cancelled', amount: TOTAL, currency: CURRENCY, charges: [], reference_id: 'ref_xyz' }));
    const result = await verifyNomodPayment(PAYMENT_ID, USER_ID);
    expect(result.paymentId).toBe(PAYMENT_ID);
    expect(result.amount).toBeDefined();
    expect(result.currency).toBe('AED');
    expect(result.chargesPaid).toBe(0);
    expect(result.referenceId).toBe('ref_xyz');
  });
});

// ─── existing guard: paymentId required ───────────────────────────────────────

describe('paymentId guard (pre-existing)', () => {
  test('throws 400 when paymentId is missing', async () => {
    await expect(verifyNomodPayment(null, USER_ID)).rejects.toMatchObject({
      status: 400,
      message: 'paymentId is required',
    });
  });
});
