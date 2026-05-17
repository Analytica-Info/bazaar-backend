'use strict';

jest.mock('../../../../src/middleware', () => ({
  asyncHandler: (fn) => fn,
}));

// Mock the DB-backed runtime-config helper so unit tests can control the
// `bannersEnabled` value without spinning up Mongo.
jest.mock('../../../../src/services/payments/getPaymentRuntimeConfig', () => ({
  getPaymentRuntimeConfig: jest.fn(),
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const { getConfig } = require('../../../../src/controllers/v2/mobile/configController');
const { getPaymentRuntimeConfig } = require('../../../../src/services/payments/getPaymentRuntimeConfig');

const PATH = '/v2/config';

function makeReq() {
  return { query: {}, params: {} };
}

function mockConfig({ bannersEnabled = true } = {}) {
  getPaymentRuntimeConfig.mockResolvedValue({ bannersEnabled });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MIN_SUPPORTED_MOBILE_VERSION;
  mockConfig();
});

describe('getConfig — wire envelope', () => {
  it('returns 200 with v2 success envelope', async () => {
    const { statusCode, body } = await runHandler(getConfig, makeReq(), { path: PATH });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('emits ONLY the minimal bootstrap fields (no nomodEnabled, no paymentMethods)', async () => {
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(Object.keys(body.data).sort()).toEqual(['bannersEnabled', 'minSupportedVersion']);
    // Regression guards — these two fields were removed as duplicates of
    // /v2/payment-methods. If they ever reappear, the wire contract
    // drifted.
    expect(body.data.nomodEnabled).toBeUndefined();
    expect(body.data.paymentMethods).toBeUndefined();
  });
});

describe('getConfig — minSupportedVersion', () => {
  it('defaults to a hardcoded string when env var not set', async () => {
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(typeof body.data.minSupportedVersion).toBe('string');
    expect(body.data.minSupportedVersion.length).toBeGreaterThan(0);
  });

  it('echoes MIN_SUPPORTED_MOBILE_VERSION env var when set', async () => {
    process.env.MIN_SUPPORTED_MOBILE_VERSION = '2.5.0';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.minSupportedVersion).toBe('2.5.0');
  });
});

describe('getConfig — bannersEnabled (home-screen carousel kill-switch)', () => {
  it('returns bannersEnabled=true when DB config has it true', async () => {
    mockConfig({ bannersEnabled: true });
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.bannersEnabled).toBe(true);
  });

  it('returns bannersEnabled=false when DB config explicitly sets it false', async () => {
    mockConfig({ bannersEnabled: false });
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.bannersEnabled).toBe(false);
  });

  it('returns bannersEnabled=true (fail-open) when the field is missing from the DB doc', async () => {
    getPaymentRuntimeConfig.mockResolvedValueOnce({}); // no bannersEnabled at all
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.bannersEnabled).toBe(true);
  });

  it('returns bannersEnabled=true (fail-open) when getPaymentRuntimeConfig throws', async () => {
    getPaymentRuntimeConfig.mockRejectedValueOnce(new Error('mongo down'));
    const { statusCode, body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(statusCode).toBe(200);
    expect(body.data.bannersEnabled).toBe(true);
  });

  it('bannersEnabled is ALWAYS typeof boolean (never undefined, null, or a string)', async () => {
    const shapes = [
      { bannersEnabled: true },
      { bannersEnabled: false },
      {},                              // field missing
      { bannersEnabled: null },        // explicit null
      { bannersEnabled: undefined },   // explicit undefined
    ];
    for (const shape of shapes) {
      getPaymentRuntimeConfig.mockResolvedValueOnce(shape);
      const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
      expect(typeof body.data.bannersEnabled).toBe('boolean');
    }
  });
});
