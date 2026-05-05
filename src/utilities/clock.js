'use strict';

/**
 * Clock seam — a swappable time source for production code.
 *
 * Usage in production code:
 *   const clock = require('../utilities/clock');
 *   const now = clock.now();     // → Date
 *   const ms  = clock.nowMs();   // → number (ms since epoch)
 *   const d   = clock.today();   // → Date at start of today UTC (midnight)
 *
 * Usage in tests:
 *   const clock = require('../../src/utilities/clock');
 *   const FROZEN = new Date('2026-05-01T00:00:00Z');
 *   beforeEach(() => clock.setClock({
 *     now:   () => FROZEN,
 *     nowMs: () => FROZEN.getTime(),
 *     today: () => new Date('2026-05-01T00:00:00Z'),
 *   }));
 *   afterEach(() => clock.resetClock());
 */

const REAL = {
    now:   () => new Date(),
    nowMs: () => Date.now(),
    today: () => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        return d;
    },
};

let _impl = REAL;

/**
 * Replace the clock implementation (for tests only).
 * @param {{ now?: () => Date, nowMs?: () => number, today?: () => Date }} fakeClock
 */
function setClock(fakeClock) {
    _impl = {
        now:   fakeClock.now   || REAL.now,
        nowMs: fakeClock.nowMs || REAL.nowMs,
        today: fakeClock.today || REAL.today,
    };
}

/** Restore the real clock. */
function resetClock() {
    _impl = REAL;
}

/** @returns {Date} */
function now() {
    return _impl.now();
}

/** @returns {number} milliseconds since epoch */
function nowMs() {
    return _impl.nowMs();
}

/** @returns {Date} start of today at UTC midnight */
function today() {
    return _impl.today();
}

module.exports = { now, nowMs, today, setClock, resetClock };
