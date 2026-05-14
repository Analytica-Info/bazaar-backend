'use strict';

/**
 * Tests for src/services/order/use-cases/createNomodCheckoutSession.js
 *
 * Mocks PaymentProviderFactory and the PendingPayment repository so no real
 * HTTP calls or DB writes occur. Follows the AAA pattern used throughout this
 * test suite.
 */

// --- module mocks (must be hoisted before require calls) ---
jest.mock('../../../src/services/payments/PaymentProviderFactory', () => ({
  create: jest.fn(),
}));
// PendingPayment.create is bound at module load time via rawModel().
// We need a stable mock object so the top-level rawModel() call returns
// something with a .create method that we can later spy on.
const mockPendingPaymentModel = { create: jest.fn() };
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
const createNomodCheckoutSession =
  require('../../../src/services/order/use-cases/createNomodCheckoutSession');

// --- fixtures ---
const SAVED_API_KEY = process.env.NOMOD_API_KEY;

const validBody = {
  cartData: [
    { id: 'v1', variantId: 'v1', name: 'Test Product', price: 90, qty: 1 },
  ],
  total: 100,
  sub_total: 90,
  currency: 'AED',
  shippingCost: 10,
  name: 'Test User',
  phone: '+971500000000',
  address: '123 Test St',
  city: 'Dubai',
  country: 'UAE',
};

const fakeCheckout = {
  id: 'ch_test_123',
  redirectUrl: 'https://pay.nomod.com/ch_test_123',
  raw: {},
};

function makeFakeProvider(overrides = {}) {
  return {
    createCheckout: jest.fn().mockResolvedValue(fakeCheckout),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NOMOD_API_KEY = 'sk_test_dummy';
  mockPendingPaymentModel.create.mockResolvedValue({});
  PaymentProviderFactory.create.mockReturnValue(makeFakeProvider());
});

afterEach(() => {
  if (SAVED_API_KEY === undefined) {
    delete process.env.NOMOD_API_KEY;
  } else {
    process.env.NOMOD_API_KEY = SAVED_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// a. Happy path
// ---------------------------------------------------------------------------
describe('createNomodCheckoutSession — happy path', () => {
  it('returns { checkout_url, payment_id, status: "created" } matching the mocked Nomod response', async () => {
    // Arrange
    const userId = 'user_abc';

    // Act
    const result = await createNomodCheckoutSession(userId, validBody, {});

    // Assert
    expect(result).toEqual({
      checkout_url: fakeCheckout.redirectUrl,
      payment_id: fakeCheckout.id,
      status: 'created',
    });
  });

  it('stores PendingPayment with the Nomod checkout id', async () => {
    // Arrange
    const userId = 'user_abc';

    // Act
    await createNomodCheckoutSession(userId, validBody, {});

    // Assert
    expect(mockPendingPaymentModel.create).toHaveBeenCalledTimes(1);
    const savedDoc = mockPendingPaymentModel.create.mock.calls[0][0];
    expect(savedDoc.payment_id).toBe(fakeCheckout.id);
    expect(savedDoc.payment_method).toBe('nomod');
    expect(savedDoc.orderfrom).toBe('Mobile App');
    expect(savedDoc.status).toBe('pending');
  });

  it('calls provider.createCheckout with correct amount and currency', async () => {
    // Arrange
    const fakeProvider = makeFakeProvider();
    PaymentProviderFactory.create.mockReturnValue(fakeProvider);

    // Act
    await createNomodCheckoutSession('u1', validBody, {});

    // Assert
    expect(fakeProvider.createCheckout).toHaveBeenCalledTimes(1);
    const callArg = fakeProvider.createCheckout.mock.calls[0][0];
    expect(callArg.amount).toBe(100);
    expect(callArg.currency).toBe('AED');
    expect(callArg.items).toHaveLength(1);
    expect(callArg.items[0].name).toBe('Test Product');
  });
});

// ---------------------------------------------------------------------------
// b. Empty cartData → 400
// ---------------------------------------------------------------------------
describe('createNomodCheckoutSession — empty cartData', () => {
  it('throws { status: 400 } when cartData is an empty array', async () => {
    // Arrange
    const body = { ...validBody, cartData: [] };

    // Act + Assert
    await expect(
      createNomodCheckoutSession('u1', body, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws { status: 400 } when cartData is missing', async () => {
    // Arrange
    const { cartData: _omit, ...body } = validBody;

    // Act + Assert
    await expect(
      createNomodCheckoutSession('u1', body, {})
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------------------
// c. Missing total → 400
// ---------------------------------------------------------------------------
describe('createNomodCheckoutSession — missing or invalid total', () => {
  it('throws { status: 400 } when total is null', async () => {
    const body = { ...validBody, total: null };
    await expect(
      createNomodCheckoutSession('u1', body, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws { status: 400 } when total is 0', async () => {
    const body = { ...validBody, total: 0 };
    await expect(
      createNomodCheckoutSession('u1', body, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws { status: 400 } when total is negative', async () => {
    const body = { ...validBody, total: -5 };
    await expect(
      createNomodCheckoutSession('u1', body, {})
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------------------
// d. Missing NOMOD_API_KEY → 500
// ---------------------------------------------------------------------------
describe('createNomodCheckoutSession — missing NOMOD_API_KEY', () => {
  it('throws { status: 500 } when NOMOD_API_KEY is not set', async () => {
    // Arrange
    delete process.env.NOMOD_API_KEY;

    // Act + Assert
    await expect(
      createNomodCheckoutSession('u1', validBody, {})
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// e. Provider throws → 502
// ---------------------------------------------------------------------------
describe('createNomodCheckoutSession — provider error', () => {
  it('throws { status: 502 } when the Nomod provider rejects', async () => {
    // Arrange
    const fakeProvider = makeFakeProvider({
      createCheckout: jest.fn().mockRejectedValue({
        status: 502,
        message: 'Bad Gateway from Nomod',
      }),
    });
    PaymentProviderFactory.create.mockReturnValue(fakeProvider);

    // Act + Assert
    await expect(
      createNomodCheckoutSession('u1', validBody, {})
    ).rejects.toMatchObject({ status: 502 });
  });

  it('wraps a generic provider error as 502', async () => {
    // Arrange
    const fakeProvider = makeFakeProvider({
      createCheckout: jest.fn().mockRejectedValue(new Error('Network timeout')),
    });
    PaymentProviderFactory.create.mockReturnValue(fakeProvider);

    // Act + Assert
    const err = await createNomodCheckoutSession('u1', validBody, {}).catch(e => e);
    expect(err.status).toBe(502);
    expect(err.message).toContain('Network timeout');
  });
});
