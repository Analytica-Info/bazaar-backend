'use strict';

/**
 * nomodStagingOverride.test.js
 *
 * Verifies the triple-gated Nomod staging amount override introduced in
 * src/config/runtime.js and src/services/order/use-cases/createNomodCheckoutSession.js.
 *
 * Each test case uses jest.isolateModules() to re-evaluate the runtime config
 * IIFE (which reads process.env at module-load time) with the env vars for
 * that specific case.
 *
 * Jest's babel transform blocks jest.mock() factory functions from closing over
 * variables that are declared outside the factory. The workaround used here:
 * create mock functions INSIDE isolateModules, assign them to a `captured`
 * object declared in the outer scope, then assert on `captured.*` after the
 * isolateModules block.
 *
 * Safety checklist (per brief):
 *   (a) NODE_ENV=production → override always null, regardless of other vars  [test d + runtime suite]
 *   (b) NOMOD_ALLOW_AMOUNT_OVERRIDE !== 'true' → never activates              [tests b, c + runtime suite]
 *   (c) Override inactive → provider call and PendingPayment unchanged         [tests a-f]
 *   (d) Override active → provider + PendingPayment use override amount        [test g]
 *   (e) verifyNomodPayment passes when override is active (amount consistent)  [test h]
 */

const FAKE_CHECKOUT_ID = 'chk_nomod_mock';
const FAKE_REDIRECT_URL = 'https://pay.nomod.com/chk_nomod_mock';

const validBody = {
  cartData: [
    { id: 'v1', variantId: 'v1', name: 'Fancy Widget', price: 250, qty: 2 },
  ],
  total: 500,
  sub_total: 500,
  currency: 'AED',
  shippingCost: 0,
  name: 'Test Buyer',
  phone: '+971500000000',
  address: '1 Sheikh Zayed Rd',
  city: 'Dubai',
  country: 'AE',
};

// ── Environment helpers ────────────────────────────────────────────────────────

const ENV_KEYS = [
  'NOMOD_ALLOW_AMOUNT_OVERRIDE',
  'NOMOD_STAGING_AMOUNT_OVERRIDE_AED',
  'NODE_ENV',
];

// NOMOD_API_KEY must always be present for the use-case runtime check.
// We set it once here and never remove it during these tests.
const SAVED_NOMOD_API_KEY = process.env.NOMOD_API_KEY;
beforeAll(() => { process.env.NOMOD_API_KEY = 'sk_test_dummy'; });
afterAll(() => {
  if (SAVED_NOMOD_API_KEY === undefined) {
    delete process.env.NOMOD_API_KEY;
  } else {
    process.env.NOMOD_API_KEY = SAVED_NOMOD_API_KEY;
  }
});

function setEnv(vars) {
  const saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
  }
  for (const k of ENV_KEYS) {
    if (vars[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = vars[k];
    }
  }
  return saved;
}

function restoreEnv(saved) {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
}

/**
 * Load createNomodCheckoutSession in a fresh module registry with the given
 * env vars. Returns `{ useCase, captured }` where captured.* are the mock fns.
 */
function loadCreateUseCase(envVars) {
  const saved = setEnv(envVars);
  // captured is populated inside isolateModules
  const captured = {};

  jest.isolateModules(() => {
    // Variables named with "mock" prefix are allowed in jest.mock factories
    // (Jest babel plugin allows "mock"-prefixed names from outer scope).
    const mockCheckoutFn = jest.fn().mockResolvedValue({
      id: FAKE_CHECKOUT_ID,
      redirectUrl: FAKE_REDIRECT_URL,
    });
    const mockPendingCreateFn = jest.fn().mockResolvedValue({});
    const mockLogFn = jest.fn().mockResolvedValue(undefined);

    jest.mock('../../../src/services/payments/PaymentProviderFactory', () => ({
      create: jest.fn(() => ({ createCheckout: mockCheckoutFn })),
    }));
    jest.mock('../../../src/repositories', () => ({
      pendingPayments: { rawModel: () => ({ create: mockPendingCreateFn }) },
    }));
    jest.mock('../../../src/utilities/backendLogger', () => ({
      logBackendActivity: mockLogFn,
    }));
    jest.mock('../../../src/utilities/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    captured.useCase = require('../../../src/services/order/use-cases/createNomodCheckoutSession');
    captured.createCheckout = mockCheckoutFn;
    captured.pendingCreate = mockPendingCreateFn;
    captured.log = mockLogFn;
  });

  restoreEnv(saved);
  return captured;
}

// ── a. Override inactive — production-like ─────────────────────────────────────

describe('a. Override inactive — NOMOD_ALLOW_AMOUNT_OVERRIDE unset, NODE_ENV=production', () => {
  it('provider receives real total (500) and real cart items', async () => {
    // Arrange
    const c = loadCreateUseCase({
      NODE_ENV: 'production',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });

    // Act
    await c.useCase('user1', validBody, {});

    // Assert
    const call = c.createCheckout.mock.calls[0][0];
    expect(call.amount).toBe(500);
    expect(call.items).toHaveLength(1);
    expect(call.items[0].name).toBe('Fancy Widget');
  });

  it('PendingPayment.create stores real total and staging_amount_override=false', async () => {
    // Arrange
    const c = loadCreateUseCase({
      NODE_ENV: 'production',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });

    // Act
    await c.useCase('user1', validBody, {});

    // Assert
    const doc = c.pendingCreate.mock.calls[0][0];
    expect(doc.order_data.total).toBe(500);
    expect(doc.order_data.staging_amount_override).toBe(false);
    expect(doc.order_data.real_total_at_creation).toBe(500);
  });
});

// ── b. Override inactive — NOMOD_ALLOW_AMOUNT_OVERRIDE='false' ────────────────

describe('b. Override inactive — NOMOD_ALLOW_AMOUNT_OVERRIDE="false"', () => {
  it('provider receives real total when allow flag is the string "false"', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'false',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    await c.useCase('user1', validBody, {});
    expect(c.createCheckout.mock.calls[0][0].amount).toBe(500);
  });

  it('PendingPayment.order_data.total is real cart total', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'false',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    await c.useCase('user1', validBody, {});
    expect(c.pendingCreate.mock.calls[0][0].order_data.total).toBe(500);
    expect(c.pendingCreate.mock.calls[0][0].order_data.staging_amount_override).toBe(false);
  });
});

// ── c. Override inactive — truthy but not literal 'true' ──────────────────────

describe('c. Override inactive — NOMOD_ALLOW_AMOUNT_OVERRIDE="1" (truthy, not literal "true")', () => {
  it('provider receives real total; literal string "true" semantics enforced', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: '1',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    await c.useCase('user1', validBody, {});
    const amount = c.createCheckout.mock.calls[0][0].amount;
    expect(amount).toBe(500);
    expect(amount).not.toBe(1);
  });
});

// ── d. Override inactive — NODE_ENV=production unconditional lock ─────────────

describe('d. Override inactive — NODE_ENV=production is an unconditional lock', () => {
  it('override stays inactive even when allow=true and amount=1', async () => {
    // ALL other gates pass; production env must block unconditionally
    const c = loadCreateUseCase({
      NODE_ENV: 'production',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    await c.useCase('user1', validBody, {});

    // Provider must see real total
    expect(c.createCheckout.mock.calls[0][0].amount).toBe(500);
    expect(c.createCheckout.mock.calls[0][0].amount).not.toBe(1);

    // No OVERRIDE warn logged
    const overrideLogs = c.log.mock.calls.filter(
      call => call[0] && call[0].activity_name === 'Nomod Staging OVERRIDE'
    );
    expect(overrideLogs).toHaveLength(0);
  });
});

// ── e. Override inactive — NaN amount ─────────────────────────────────────────

describe('e. Override inactive — NOMOD_STAGING_AMOUNT_OVERRIDE_AED="abc" (NaN)', () => {
  it('provider receives real total when amount is not parseable as number', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: 'abc',
    });
    await c.useCase('user1', validBody, {});
    expect(c.createCheckout.mock.calls[0][0].amount).toBe(500);
  });
});

// ── f. Override inactive — zero amount ────────────────────────────────────────

describe('f. Override inactive — NOMOD_STAGING_AMOUNT_OVERRIDE_AED="0" (not positive)', () => {
  it('provider receives real total when override amount is 0', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '0',
    });
    await c.useCase('user1', validBody, {});
    expect(c.createCheckout.mock.calls[0][0].amount).toBe(500);
  });
});

// ── g. Override ACTIVE happy path ─────────────────────────────────────────────

describe('g. Override ACTIVE — all three gates pass (allow=true, NODE_ENV=staging, override=1)', () => {
  it('provider receives override amount (1) and a single synthetic line item', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    await c.useCase('user1', validBody, {});

    const call = c.createCheckout.mock.calls[0][0];
    expect(call.amount).toBe(1);
    expect(call.items).toHaveLength(1);
    expect(call.items[0].id).toBe('staging-test');
    expect(call.items[0].name).toBe('Staging test charge');
    expect(call.items[0].quantity).toBe(1);
    expect(call.items[0].price).toBe(1);
  });

  it('PendingPayment.order_data.total=1, real_total_at_creation=500, staging_amount_override=true', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    await c.useCase('user1', validBody, {});

    const doc = c.pendingCreate.mock.calls[0][0];
    expect(doc.order_data.total).toBe(1);
    expect(doc.order_data.real_total_at_creation).toBe(500);
    expect(doc.order_data.staging_amount_override).toBe(true);
  });

  it('logBackendActivity is called with a message containing "OVERRIDE" at status "warning"', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    await c.useCase('user1', validBody, {});

    const overrideCalls = c.log.mock.calls.filter(
      call => call[0] && typeof call[0].message === 'string' && call[0].message.includes('OVERRIDE')
    );
    expect(overrideCalls.length).toBeGreaterThanOrEqual(1);
    expect(overrideCalls[0][0].status).toBe('warning');
  });

  it('returns { checkout_url, payment_id, status: "created" }', async () => {
    const c = loadCreateUseCase({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    });
    const result = await c.useCase('user1', validBody, {});
    expect(result).toEqual({
      checkout_url: FAKE_REDIRECT_URL,
      payment_id: FAKE_CHECKOUT_ID,
      status: 'created',
    });
  });
});

// ── h. verifyNomodPayment passes when override is active ──────────────────────

describe('h. verifyNomodPayment is consistent with override (no AMOUNT_MISMATCH)', () => {
  it('resolves when Nomod reports amount=1 and order_data.total=1 (override scenario)', async () => {
    // Arrange
    let verifyNomodPayment;
    const mockGetCheckoutFn = jest.fn().mockResolvedValue({
      paid: true,
      status: 'paid',
      amount: 1,
      currency: 'AED',
      charges: [],
      reference_id: 'ref_staging_test',
    });
    const mockFindOneFn = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          user_id: 'user1',
          order_data: {
            // What createNomodCheckoutSession stores when override is active
            total: 1,
            real_total_at_creation: 500,
            staging_amount_override: true,
            currency: 'AED',
          },
        }),
      }),
    });
    const mockLogVerifyFn = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.mock('../../../src/services/payments/PaymentProviderFactory', () => ({
        create: jest.fn(() => ({ getCheckout: mockGetCheckoutFn })),
      }));
      jest.mock('../../../src/repositories', () => ({
        pendingPayments: { rawModel: () => ({ findOne: mockFindOneFn }) },
      }));
      jest.mock('../../../src/utilities/backendLogger', () => ({
        logBackendActivity: mockLogVerifyFn,
      }));
      verifyNomodPayment =
        require('../../../src/services/order/use-cases/verifyNomodPayment');
    });

    // Act — must NOT throw
    const result = await verifyNomodPayment(FAKE_CHECKOUT_ID, 'user1');

    // Assert — paid path, no AMOUNT_MISMATCH
    expect(result).toMatchObject({ paymentId: FAKE_CHECKOUT_ID });
    expect(result.finalStatus).toBeUndefined();

    // logBackendActivity must NOT have been called with 'mismatch' in the message
    const mismatchCalls = mockLogVerifyFn.mock.calls.filter(
      call => call[0] && typeof call[0].message === 'string' && call[0].message.includes('mismatch')
    );
    expect(mismatchCalls).toHaveLength(0);
  });

  it('throws AMOUNT_MISMATCH when Nomod reports 500 but order_data.total=1 (override stored)', async () => {
    // Proves consistency: if Nomod somehow reports the real cart total back
    // but we stored the 1 AED override, the mismatch guard fires correctly.
    let verifyNomodPayment;
    const mockGetCheckoutFn2 = jest.fn().mockResolvedValue({
      paid: true,
      status: 'paid',
      amount: 500, // real cart total — but we charged (and stored) 1
      currency: 'AED',
      charges: [],
    });
    const mockFindOneFn2 = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          user_id: 'user1',
          order_data: { total: 1, currency: 'AED' },
        }),
      }),
    });
    const mockLogFn2 = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.mock('../../../src/services/payments/PaymentProviderFactory', () => ({
        create: jest.fn(() => ({ getCheckout: mockGetCheckoutFn2 })),
      }));
      jest.mock('../../../src/repositories', () => ({
        pendingPayments: { rawModel: () => ({ findOne: mockFindOneFn2 }) },
      }));
      jest.mock('../../../src/utilities/backendLogger', () => ({
        logBackendActivity: mockLogFn2,
      }));
      verifyNomodPayment =
        require('../../../src/services/order/use-cases/verifyNomodPayment');
    });

    // Act + Assert — must throw AMOUNT_MISMATCH
    await expect(verifyNomodPayment(FAKE_CHECKOUT_ID, 'user1'))
      .rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
  });
});

// ── Runtime config gate — unit tests ──────────────────────────────────────────

describe('runtime config — nomodOverride.stagingAmountOverrideAed gate logic', () => {
  /**
   * Load runtime.js in isolation with given env vars.
   * Returns the resolved stagingAmountOverrideAed value.
   */
  function loadRuntimeOverride(envVars) {
    const saved = setEnv(envVars);
    let result;
    jest.isolateModules(() => {
      const config = require('../../../src/config/runtime');
      result = config.nomodOverride.stagingAmountOverrideAed;
    });
    restoreEnv(saved);
    return result;
  }

  it('returns null when NODE_ENV=production (all other gates pass)', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'production',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    })).toBeNull();
  });

  it('returns null when NOMOD_ALLOW_AMOUNT_OVERRIDE is absent', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    })).toBeNull();
  });

  it('returns null when NOMOD_ALLOW_AMOUNT_OVERRIDE="false"', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'false',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    })).toBeNull();
  });

  it('returns null when NOMOD_ALLOW_AMOUNT_OVERRIDE="1" (truthy, not literal "true")', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: '1',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    })).toBeNull();
  });

  it('returns null when NOMOD_ALLOW_AMOUNT_OVERRIDE="TRUE" (case mismatch)', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'TRUE',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    })).toBeNull();
  });

  it('returns null when amount is NaN ("abc")', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: 'abc',
    })).toBeNull();
  });

  it('returns null when amount is 0 (not positive)', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '0',
    })).toBeNull();
  });

  it('returns null when amount is negative', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '-5',
    })).toBeNull();
  });

  it('returns null when NODE_ENV=development and amount env is absent', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'development',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
    })).toBeNull();
  });

  it('returns the parsed positive number when all three gates pass', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '1',
    })).toBe(1);
  });

  it('returns decimal values correctly (e.g. 0.5 AED)', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'staging',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '0.5',
    })).toBe(0.5);
  });

  it('returns a large positive value when all gates pass (e.g. 100 AED)', () => {
    expect(loadRuntimeOverride({
      NODE_ENV: 'test',
      NOMOD_ALLOW_AMOUNT_OVERRIDE: 'true',
      NOMOD_STAGING_AMOUNT_OVERRIDE_AED: '100',
    })).toBe(100);
  });
});
