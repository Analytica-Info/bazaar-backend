'use strict';

const clock = require('../../src/utilities/clock');

describe('clock', () => {
    afterEach(() => clock.resetClock());

    describe('default (real) behavior', () => {
        it('now() returns a Date', () => {
            const result = clock.now();
            expect(result).toBeInstanceOf(Date);
        });

        it('now() is close to wall-clock time', () => {
            const before = Date.now();
            const result = clock.now().getTime();
            const after = Date.now();
            expect(result).toBeGreaterThanOrEqual(before);
            expect(result).toBeLessThanOrEqual(after);
        });

        it('nowMs() returns a number', () => {
            const result = clock.nowMs();
            expect(typeof result).toBe('number');
        });

        it('nowMs() is close to Date.now()', () => {
            const before = Date.now();
            const result = clock.nowMs();
            const after = Date.now();
            expect(result).toBeGreaterThanOrEqual(before);
            expect(result).toBeLessThanOrEqual(after);
        });

        it('today() returns a Date', () => {
            const result = clock.today();
            expect(result).toBeInstanceOf(Date);
        });

        it('today() is at UTC midnight', () => {
            const result = clock.today();
            expect(result.getUTCHours()).toBe(0);
            expect(result.getUTCMinutes()).toBe(0);
            expect(result.getUTCSeconds()).toBe(0);
            expect(result.getUTCMilliseconds()).toBe(0);
        });

        it('today() date matches current UTC date', () => {
            const real = new Date();
            const todayResult = clock.today();
            expect(todayResult.getUTCFullYear()).toBe(real.getUTCFullYear());
            expect(todayResult.getUTCMonth()).toBe(real.getUTCMonth());
            expect(todayResult.getUTCDate()).toBe(real.getUTCDate());
        });
    });

    describe('setClock / resetClock', () => {
        const FROZEN = new Date('2026-05-01T12:34:56Z');
        const FROZEN_MS = FROZEN.getTime();
        const FROZEN_TODAY = new Date('2026-05-01T00:00:00Z');

        beforeEach(() => {
            clock.setClock({
                now:   () => FROZEN,
                nowMs: () => FROZEN_MS,
                today: () => FROZEN_TODAY,
            });
        });

        it('now() returns frozen date', () => {
            expect(clock.now()).toBe(FROZEN);
        });

        it('nowMs() returns frozen ms', () => {
            expect(clock.nowMs()).toBe(FROZEN_MS);
        });

        it('today() returns frozen today', () => {
            expect(clock.today()).toBe(FROZEN_TODAY);
        });

        it('resetClock() restores real behavior', () => {
            clock.resetClock();
            const before = Date.now();
            const result = clock.nowMs();
            const after = Date.now();
            expect(result).toBeGreaterThanOrEqual(before);
            expect(result).toBeLessThanOrEqual(after);
        });

        it('multiple setClock calls — last one wins', () => {
            const SECOND = new Date('2030-01-01T00:00:00Z');
            clock.setClock({ now: () => SECOND });
            expect(clock.now()).toBe(SECOND);
        });
    });

    describe('setClock with partial override', () => {
        it('falls back to real now() when not supplied', () => {
            clock.setClock({ nowMs: () => 9999 });
            const before = Date.now();
            const result = clock.now().getTime();
            const after = Date.now();
            expect(result).toBeGreaterThanOrEqual(before);
            expect(result).toBeLessThanOrEqual(after);
            expect(clock.nowMs()).toBe(9999);
        });

        it('falls back to real today() when not supplied', () => {
            clock.setClock({ now: () => new Date('2026-05-01T00:00:00Z') });
            const todayResult = clock.today();
            // Should be real today, not frozen
            expect(todayResult.getUTCHours()).toBe(0);
        });
    });

    describe('edge cases', () => {
        it('nowMs() and now() are consistent when frozen', () => {
            const FROZEN2 = new Date('2026-05-01T00:00:00Z');
            clock.setClock({
                now:   () => FROZEN2,
                nowMs: () => FROZEN2.getTime(),
            });
            expect(clock.now().getTime()).toBe(clock.nowMs());
        });

        it('today() is at midnight relative to frozen now', () => {
            const FROZEN3 = new Date('2026-05-01T00:00:00Z');
            clock.setClock({
                now:   () => FROZEN3,
                nowMs: () => FROZEN3.getTime(),
                today: () => new Date('2026-05-01T00:00:00Z'),
            });
            expect(clock.today().getUTCDate()).toBe(1);
            expect(clock.today().getUTCMonth()).toBe(4); // May = 4 (0-indexed)
        });
    });
});
