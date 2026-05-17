'use strict';

/**
 * Regression test for the production calling pattern.
 *
 * Previously, controllers used:
 *     exports.X = withAuthErrors(asyncHandler(async (req, res) => { ... }))
 *
 * In tests, handlers were invoked WITHOUT a `next` arg:
 *     await ctrl.X(req, res);
 * Under that pattern, asyncHandler's `.catch(next)` becomes `.catch(undefined)`,
 * which is ignored — so the rejection propagated to withAuthErrors and tests
 * passed. In production Express passes a real `next`, asyncHandler swallowed
 * the error via `next(err)`, and the global error handler rendered the raw
 * technical message — bypassing withAuthErrors entirely.
 *
 * Fix: drop asyncHandler from inside withAuthErrors and have withAuthErrors
 * itself swallow the rejection. This test pins the behaviour with a real
 * `next` function and asserts:
 *   - withAuthErrors's catch DOES fire
 *   - The translated v2 envelope is sent
 *   - next() is NEVER called (no Express error-middleware bypass)
 */

const { withAuthErrors } = require('../../../../src/controllers/v2/_shared/withAuthErrors');

function makeRes() {
    const r = {};
    r.status = jest.fn().mockReturnValue(r);
    r.json = jest.fn().mockReturnValue(r);
    return r;
}

describe('withAuthErrors — production calling pattern (with next)', () => {
    it('catches the error and sends a v2 envelope; next is NOT called', async () => {
        const next = jest.fn();
        const handler = withAuthErrors(async () => {
            throw { status: 401, message: 'Invalid email or password' };
        });

        const res = makeRes();
        await handler({}, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('INVALID_CREDENTIALS');
        expect(body.error.message).toContain("doesn't match our records");
    });

    it('preserves already-user-friendly messages verbatim (account blocked)', async () => {
        const next = jest.fn();
        const handler = withAuthErrors(async () => {
            throw { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' };
        });

        const res = makeRes();
        await handler({}, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].error.message).toBe(
            'Your account has been blocked. Please contact support for assistance.'
        );
    });

    it('falls back to status-bucketed generic message for unmapped throws', async () => {
        const next = jest.fn();
        const handler = withAuthErrors(async () => {
            throw { status: 400, message: 'some-technical-string-clients-must-never-see' };
        });

        const res = makeRes();
        await handler({}, res, next);

        const body = res.json.mock.calls[0][0];
        expect(body.error.message).not.toContain('some-technical-string');
    });
});
