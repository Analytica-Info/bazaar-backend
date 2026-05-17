'use strict';

jest.mock('../../../../src/services/checkoutService', () => ({
    createNomodCheckout: jest.fn(),
    verifyNomodPayment: jest.fn(),
}));
jest.mock('../../../../src/services/orderService', () => ({
    getAddresses: jest.fn(),
    storeAddress: jest.fn(),
    deleteAddress: jest.fn(),
    setPrimaryAddress: jest.fn(),
    validateInventoryBeforeCheckout: jest.fn(),
}));
jest.mock('../../../../src/utilities/logger', () => ({
    info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const checkoutService = require('../../../../src/services/checkoutService');
const ctrl = require('../../../../src/controllers/v2/web/orderController');
const { runHandler } = require('../../../_helpers/handlerExec');

const makeReq = (opts = {}) => ({
    user: opts.user || { _id: 'u1' },
    params: opts.params || {},
    body: opts.body || {},
    query: opts.query || {},
    headers: opts.headers || {},
    cookies: opts.cookies || {},
    header: jest.fn((h) => (opts.headers || {})[h]),
});

beforeEach(() => jest.clearAllMocks());

// ── POST /v2/orders/checkouts/nomod ──────────────────────────────────────────

describe('checkoutNomod', () => {
    it('200 — returns checkoutId, checkoutUrl, status in envelope', async () => {
        checkoutService.createNomodCheckout.mockResolvedValue({
            checkout_id: 'chk_abc123',
            checkout_url: 'https://pay.nomod.com/abc123',
            status: 'created',
        });

        const req = makeReq({ body: { cartData: [{ productId: 'p1', qty: 1, price: 100 }] } });
        const { statusCode, body } = await runHandler(ctrl.createNomodCheckout, req, { path: '/v2/test' });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({
            checkoutId: 'chk_abc123',
            checkoutUrl: 'https://pay.nomod.com/abc123',
            status: 'created',
        });
        expect(checkoutService.createNomodCheckout).toHaveBeenCalledWith(expect.objectContaining({ body: req.body }));
    });

    it('400 — service throws cartData validation error → v2 error envelope', async () => {
        checkoutService.createNomodCheckout.mockRejectedValue({ status: 400, message: 'cartData is required' });

        const req = makeReq({ body: {} });
        const { statusCode, body } = await runHandler(ctrl.createNomodCheckout, req, { path: '/v2/test' });

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error.message).toMatch(/cartData is required/);
    });

    it('401 — no token → auth middleware returns 401 (simulated via service throw)', async () => {
        checkoutService.createNomodCheckout.mockRejectedValue({ status: 401, message: 'No token provided' });

        const req = makeReq({ user: null, headers: {} });
        const { statusCode, body } = await runHandler(ctrl.createNomodCheckout, req, { path: '/v2/test' });

        expect(statusCode).toBe(401);
        expect(body.success).toBe(false);
    });
});

// ── POST /v2/orders/checkouts/nomod/verify ────────────────────────────────────

describe('verifyNomod', () => {
    it('200 — returns orderId in envelope', async () => {
        checkoutService.verifyNomodPayment.mockResolvedValue({
            message: 'Order created successfully',
            orderId: 'ord_xyz789',
        });

        const req = makeReq({ body: { paymentId: 'pay_abc' } });
        const { statusCode, body } = await runHandler(ctrl.verifyNomodCheckout, req, { path: '/v2/test' });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ orderId: 'ord_xyz789' });
        expect(checkoutService.verifyNomodPayment).toHaveBeenCalledWith(expect.objectContaining({ body: req.body }));
    });

    it('200 dedup — orderId is null when order already existed', async () => {
        checkoutService.verifyNomodPayment.mockResolvedValue({
            message: 'Order already created',
        });

        const req = makeReq({ body: { paymentId: 'pay_dup' } });
        const { statusCode, body } = await runHandler(ctrl.verifyNomodCheckout, req, { path: '/v2/test' });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ orderId: null });
        expect(body.message).toBe('Order already created');
    });

    it('400 — service throws missing paymentId → v2 error envelope', async () => {
        checkoutService.verifyNomodPayment.mockRejectedValue({ status: 400, message: 'paymentId is required' });

        const req = makeReq({ body: {} });
        const { statusCode, body } = await runHandler(ctrl.verifyNomodCheckout, req, { path: '/v2/test' });

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error.message).toMatch(/paymentId is required/);
    });

    it('401 — no token → auth middleware returns 401 (simulated via service throw)', async () => {
        checkoutService.verifyNomodPayment.mockRejectedValue({ status: 401, message: 'No token provided' });

        const req = makeReq({ user: null, headers: {} });
        const { statusCode, body } = await runHandler(ctrl.verifyNomodCheckout, req, { path: '/v2/test' });

        expect(statusCode).toBe(401);
        expect(body.success).toBe(false);
    });
});
