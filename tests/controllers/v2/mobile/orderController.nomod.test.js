'use strict';

/**
 * Pins the v2 mobile Nomod checkout response shape:
 *   data: { paymentId, checkoutId, checkoutUrl, status }
 *
 * Before this commit, the mobile controller read `result.paymentId` from
 * the service result — but the service returns snake_case `payment_id` and
 * `checkout_url`, so the mobile envelope was `{ paymentId: undefined,
 * status: 'created' }` with no URL at all. Clients had to send
 * X-Client: web to route through the web controller (which uses the
 * different `checkoutService` use-case) just to get a usable URL.
 *
 * Now mobile gets the URL directly and no longer needs the X-Client
 * workaround.
 */

jest.mock('../../../../src/services/orderService', () => ({
    createNomodCheckoutSession: jest.fn(),
    verifyNomodPayment: jest.fn(),
    // Stubs for the other handlers that load when this controller is required:
    getOrders: jest.fn(),
    validateInventoryBeforeCheckout: jest.fn(),
    createStripeCheckoutSession: jest.fn(),
    createTabbyCheckoutSession: jest.fn(),
    verifyTabbyPayment: jest.fn(),
    initStripePayment: jest.fn(),
    getPaymentMethods: jest.fn(),
}));
jest.mock('../../../../src/utilities/logger', () => ({
    info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const orderService = require('../../../../src/services/orderService');
const ctrl = require('../../../../src/controllers/v2/mobile/orderController');
const { runHandler } = require('../../../_helpers/handlerExec');

const makeReq = (opts = {}) => ({
    user: opts.user || { _id: 'u1', fcmToken: 'fcm123' },
    params: opts.params || {},
    body: opts.body || {},
    query: opts.query || {},
    headers: opts.headers || {},
    header: jest.fn((h) => (opts.headers || {})[h]),
});

beforeEach(() => jest.clearAllMocks());

describe('mobile v2 checkoutNomod', () => {
    it('200 — surfaces checkoutUrl + paymentId + checkoutId from snake_case service result', async () => {
        orderService.createNomodCheckoutSession.mockResolvedValue({
            checkout_url: 'https://pay.nomod.com/abc123',
            payment_id: 'pay_abc123',
            status: 'created',
        });

        const req = makeReq({
            body: { cartData: [{ variantId: 'v1', qty: 1, price: 100 }], total: 100 },
        });
        const { statusCode, body } = await runHandler(ctrl.createNomodCheckout, req, { path: '/v2/orders/checkouts/nomod' });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({
            paymentId: 'pay_abc123',
            checkoutId: 'pay_abc123',
            checkoutUrl: 'https://pay.nomod.com/abc123',
            status: 'created',
        });
    });

    it('does NOT return undefined fields if the service omits them', async () => {
        orderService.createNomodCheckoutSession.mockResolvedValue({
            checkout_url: 'https://pay.nomod.com/x',
            payment_id: 'pay_x',
            status: 'created',
        });
        const req = makeReq({ body: { cartData: [{ variantId: 'v', qty: 1, price: 10 }], total: 10 } });
        const { body } = await runHandler(ctrl.createNomodCheckout, req, { path: '/v2/orders/checkouts/nomod' });

        // Guards against future regression of the snake/camel mismatch
        expect(body.data.paymentId).toBe('pay_x');
        expect(body.data.checkoutUrl).toBe('https://pay.nomod.com/x');
        expect(body.data.paymentId).not.toBeUndefined();
        expect(body.data.checkoutUrl).not.toBeUndefined();
    });
});
