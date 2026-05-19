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

    const authedUser = { _id: 'user-001', email: 'user@example.com' };

    it('returns 401 when no JWT (req.user missing) — defensive behind auth.required()', async () => {
        // auth.required() middleware normally rejects before this handler runs;
        // this guard catches any misrouting and is the contract surface tests pin.
        const req = makeReq({ body: { vertical: 'auction' } }); // no user
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(401);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
        expect(body.error.message).toMatch(/Sign in required/i);
        expect(verticalsService.createSubscription).not.toHaveBeenCalled();
    });

    it('returns 200 with alreadySubscribed: false on new subscription (email from JWT)', async () => {
        verticalsService.createSubscription.mockResolvedValue({ alreadySubscribed: false });

        const req = makeReq({ user: authedUser, body: { vertical: 'auction', pushOptIn: true } });
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ alreadySubscribed: false });
        expect(body.message).toBe('Subscribed');
        // Email is sourced from the JWT, not the body
        expect(verticalsService.createSubscription).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'user@example.com', userId: 'user-001', vertical: 'auction' })
        );
    });

    it('returns 200 with alreadySubscribed: true on duplicate', async () => {
        verticalsService.createSubscription.mockResolvedValue({ alreadySubscribed: true });

        const req = makeReq({ user: authedUser, body: { vertical: 'auction' } });
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(200);
        expect(body.data.alreadySubscribed).toBe(true);
    });

    it('returns 400 when vertical is unknown', async () => {
        verticalsService.createSubscription.mockRejectedValue({ status: 400, message: 'Invalid vertical' });

        const req = makeReq({ user: authedUser, body: { vertical: 'foo' } });
        const { statusCode, body } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error.message).toBe('Invalid vertical');
    });

    it('IGNORES body.email — uses the authenticated user email (prevents impersonation)', async () => {
        // Security guard: a signed-in user must not be able to subscribe a
        // different person's email by stuffing it into the request body.
        verticalsService.createSubscription.mockResolvedValue({ alreadySubscribed: false });

        const req = makeReq({
            user: authedUser, // user@example.com
            body: { email: 'victim@evil.com', vertical: 'auction' },
        });
        const { statusCode } = await runHandler(subscribe, req, { path: '/v2/notifications/subscriptions' });

        expect(statusCode).toBe(200);
        // Service must receive the JWT email, never the body email
        const call = verticalsService.createSubscription.mock.calls[0][0];
        expect(call.email).toBe('user@example.com');
        expect(call.email).not.toBe('victim@evil.com');
    });
});
