'use strict';

/**
 * Unit tests for verticalsController (v2 shared).
 */

jest.mock('../../../../src/services/verticalsService');
jest.mock('../../../../src/utilities/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const verticalsService = require('../../../../src/services/verticalsService');
const { list, subscribe } = require('../../../../src/controllers/v2/shared/verticalsController');

function makeReq(overrides = {}) {
    return {
        body: {},
        query: {},
        user: null,
        ...overrides,
    };
}

// ── GET /v2/verticals ─────────────────────────────────────────────────────────

describe('verticalsController.list', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 with wrapped verticals array', async () => {
        const mockVerticals = [
            { id: 'uae', label: 'UAE', tag: 'Default', enabled: true, comingSoon: false },
            { id: 'auction', label: 'Auction', tag: 'Live', enabled: false, comingSoon: true },
        ];
        verticalsService.listVerticals.mockResolvedValue(mockVerticals);

        const { statusCode, body } = await runHandler(list, makeReq(), { path: '/v2/verticals' });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ verticals: mockVerticals });
    });

    it('returns 500 on unexpected error', async () => {
        verticalsService.listVerticals.mockRejectedValue(new Error('DB down'));

        const { statusCode, body } = await runHandler(list, makeReq(), { path: '/v2/verticals' });

        expect(statusCode).toBe(500);
        expect(body.success).toBe(false);
    });
});

// ── POST /v2/notifications/subscriptions ────────────────────────────────────────────────────────

describe('verticalsController.subscribe', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 with alreadySubscribed: false on new subscription', async () => {
        verticalsService.createSubscription.mockResolvedValue({ alreadySubscribed: false });

        const req = makeReq({ body: { email: 'user@example.com', vertical: 'auction' } });
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ alreadySubscribed: false });
        expect(body.message).toBe('Subscribed');
    });

    it('returns 200 with alreadySubscribed: true on duplicate', async () => {
        verticalsService.createSubscription.mockResolvedValue({ alreadySubscribed: true });

        const req = makeReq({ body: { email: 'user@example.com', vertical: 'auction' } });
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(200);
        expect(body.data.alreadySubscribed).toBe(true);
    });

    it('returns 400 when email is missing', async () => {
        verticalsService.createSubscription.mockRejectedValue({ status: 400, message: 'Invalid email' });

        const req = makeReq({ body: { vertical: 'auction' } });
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error.message).toBe('Invalid email');
    });

    it('returns 400 when vertical is unknown', async () => {
        verticalsService.createSubscription.mockRejectedValue({ status: 400, message: 'Invalid vertical' });

        const req = makeReq({ body: { email: 'user@example.com', vertical: 'foo' } });
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error.message).toBe('Invalid vertical');
    });
});
