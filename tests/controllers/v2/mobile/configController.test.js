'use strict';

jest.mock('../../../../src/middleware', () => ({
  asyncHandler: (fn) => fn,
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const { getConfig } = require('../../../../src/controllers/v2/mobile/configController');

const PATH = '/v2/config';

function makeReq() {
  return { query: {}, params: {} };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset env vars to a clean slate before each test
  delete process.env.MIN_SUPPORTED_MOBILE_VERSION;
  delete process.env.NOMOD_ENABLED;
  delete process.env.TABBY_AUTH_KEY;
  delete process.env.TABBY_SECRET_KEY;
});

// ── wrap envelope ───────────────────────────────────────────────────────────

describe('getConfig', () => {
  it('returns 200 with v2 success envelope', async () => {
    const { statusCode, body } = await runHandler(getConfig, makeReq(), { path: PATH });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  // ── default env (nothing set) ─────────────────────────────────────

  it('defaults to a hardcoded minSupportedVersion when env var not set', async () => {
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(typeof body.data.minSupportedVersion).toBe('string');
    expect(body.data.minSupportedVersion.length).toBeGreaterThan(0);
  });

  it('paymentMethods defaults to ["stripe"] only', async () => {
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.paymentMethods).toEqual(['stripe']);
  });

  it('nomodEnabled is false by default', async () => {
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.nomodEnabled).toBe(false);
  });

  // ── NOMOD_ENABLED=true ────────────────────────────────────────────

  it('includes nomod in paymentMethods when NOMOD_ENABLED=true', async () => {
    process.env.NOMOD_ENABLED = 'true';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.nomodEnabled).toBe(true);
    expect(body.data.paymentMethods).toContain('nomod');
  });

  it('does not include nomod when NOMOD_ENABLED is not "true"', async () => {
    process.env.NOMOD_ENABLED = 'false';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.nomodEnabled).toBe(false);
    expect(body.data.paymentMethods).not.toContain('nomod');
  });

  // ── Tabby keys ───────────────────────────────────────────────────

  it('includes tabby when both TABBY_AUTH_KEY and TABBY_SECRET_KEY are set', async () => {
    process.env.TABBY_AUTH_KEY = 'pk_test_key';
    process.env.TABBY_SECRET_KEY = 'sk_test_secret';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.paymentMethods).toContain('tabby');
  });

  it('does NOT include tabby when only TABBY_AUTH_KEY is set', async () => {
    process.env.TABBY_AUTH_KEY = 'pk_test_key';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.paymentMethods).not.toContain('tabby');
  });

  it('does NOT include tabby when only TABBY_SECRET_KEY is set', async () => {
    process.env.TABBY_SECRET_KEY = 'sk_test_secret';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.paymentMethods).not.toContain('tabby');
  });

  // ── Custom minSupportedVersion ────────────────────────────────────

  it('echoes MIN_SUPPORTED_MOBILE_VERSION env var', async () => {
    process.env.MIN_SUPPORTED_MOBILE_VERSION = '2.5.0';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.minSupportedVersion).toBe('2.5.0');
  });

  // ── All enabled ───────────────────────────────────────────────────

  it('includes stripe, nomod, tabby when all enabled', async () => {
    process.env.NOMOD_ENABLED = 'true';
    process.env.TABBY_AUTH_KEY = 'pk_test_key';
    process.env.TABBY_SECRET_KEY = 'sk_test_secret';
    const { body } = await runHandler(getConfig, makeReq(), { path: PATH });
    expect(body.data.paymentMethods).toEqual(['stripe', 'nomod', 'tabby']);
  });
});
