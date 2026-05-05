'use strict';

/**
 * metricsService tests.
 *
 * Redis is mocked in-memory. The clock is frozen so key names are deterministic.
 */

// ── Freeze time ────────────────────────────────────────────────────
const FROZEN = new Date('2026-05-01T10:30:00.000Z');
const FROZEN_MINUTE = '2026-05-01T10:30'; // slice(0,16)

afterEach(() => {
    jest.resetModules();
});

// ── Redis mock ─────────────────────────────────────────────────────
// Build a simple in-memory Redis stub that satisfies the metricsService API
function makeRedisStub() {
    const store = {};
    const lists = {};
    return {
        _store: store,
        _lists: lists,
        async incr(key) {
            store[key] = (store[key] || 0) + 1;
            return store[key];
        },
        async incrby(key, n) {
            store[key] = (store[key] || 0) + n;
            return store[key];
        },
        async expire() {},
        async mget(...keys) {
            return keys.map(k => store[k] != null ? String(store[k]) : null);
        },
        async lpush(key, value) {
            if (!lists[key]) lists[key] = [];
            lists[key].unshift(value);
            return lists[key].length;
        },
        async ltrim(key, start, end) {
            if (lists[key]) lists[key] = lists[key].slice(start, end + 1);
        },
        async lrange(key, start, end) {
            if (!lists[key]) return [];
            return lists[key].slice(start, end + 1);
        },
    };
}

function makeRedisConfig(stub, enabled = true) {
    return {
        getClient: () => stub,
        isEnabled: () => enabled,
    };
}

function loadMetrics(redisStub, enabled = true) {
    jest.resetModules();
    jest.doMock('../../src/config/redis', () => makeRedisConfig(redisStub, enabled));
    const metrics = require('../../src/services/metricsService');
    // Freeze clock on the fresh module instance
    const clockInstance = require('../../src/utilities/clock');
    clockInstance.setClock({
        now:   () => new Date(FROZEN),
        nowMs: () => FROZEN.getTime(),
        today: () => new Date('2026-05-01T00:00:00Z'),
    });
    return metrics;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('metricsService', () => {
    describe('recordWebhook', () => {
        it('increments the correct key for current minute', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordWebhook('product-update');

            const expectedKey = `bazaar:metrics:webhook:product-update:${FROZEN_MINUTE}`;
            expect(stub._store[expectedKey]).toBe(1);
        });

        it('is idempotent — increments on each call', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordWebhook('inventory-update');
            await metrics.recordWebhook('inventory-update');

            const expectedKey = `bazaar:metrics:webhook:inventory-update:${FROZEN_MINUTE}`;
            expect(stub._store[expectedKey]).toBe(2);
        });

        it('does nothing when redis is disabled', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub, false);

            await metrics.recordWebhook('product-update');

            expect(Object.keys(stub._store)).toHaveLength(0);
        });

        it('does nothing when redis client is null', async () => {
            jest.resetModules();
            jest.doMock('../../src/config/redis', () => ({
                getClient: () => null,
                isEnabled: () => true,
            }));
            const metrics = require('../../src/services/metricsService');
            const clockInstance = require('../../src/utilities/clock');
            clockInstance.setClock({
                now: () => new Date(FROZEN),
                nowMs: () => FROZEN.getTime(),
                today: () => new Date('2026-05-01T00:00:00Z'),
            });

            await expect(metrics.recordWebhook('product-update')).resolves.toBeUndefined();
        });
    });

    describe('recordDedup', () => {
        it('increments dedup key for current minute', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordDedup('sale-update');

            const expectedKey = `bazaar:metrics:dedup:sale-update:${FROZEN_MINUTE}`;
            expect(stub._store[expectedKey]).toBe(1);
        });
    });

    describe('recordError', () => {
        it('increments error counter key', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordError('test-ctx', 'something went wrong');

            const expectedKey = `bazaar:metrics:errors:${FROZEN_MINUTE}`;
            expect(stub._store[expectedKey]).toBe(1);
        });

        it('pushes entry to error log list', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordError('ctx', 'msg');

            const entries = stub._lists['bazaar:metrics:error-log'];
            expect(entries).toHaveLength(1);
            const parsed = JSON.parse(entries[0]);
            expect(parsed.ctx).toBe('ctx');
            expect(parsed.msg).toBe('msg');
        });
    });

    describe('recordRequest', () => {
        it.each(['user-api', 'admin-api', 'webhook'])(
            'increments request key for source %s',
            async (source) => {
                const stub = makeRedisStub();
                const metrics = loadMetrics(stub);

                await metrics.recordRequest(source);

                const expectedKey = `bazaar:metrics:req:${source}:${FROZEN_MINUTE}`;
                expect(stub._store[expectedKey]).toBe(1);
            }
        );
    });

    describe('recordDiscountSync', () => {
        it('increments sync counter and docs counter', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordDiscountSync(42);

            const syncKey = `bazaar:metrics:discount-sync:${FROZEN_MINUTE}`;
            const docsKey = `bazaar:metrics:discount-sync-docs:${FROZEN_MINUTE}`;
            expect(stub._store[syncKey]).toBe(1);
            expect(stub._store[docsKey]).toBe(42);
        });
    });

    describe('getWebhookTimeline', () => {
        it('returns empty structure when redis disabled', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub, false);

            const result = await metrics.getWebhookTimeline(5);

            expect(result).toEqual({ minutes: [], series: {}, dedup: {} });
        });

        it('returns minutes array of correct length', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            const result = await metrics.getWebhookTimeline(5);

            expect(result.minutes).toHaveLength(5);
        });

        it('last minute in window equals current frozen minute', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            const result = await metrics.getWebhookTimeline(3);

            expect(result.minutes[result.minutes.length - 1]).toBe(FROZEN_MINUTE);
        });

        it('includes recorded webhook in correct minute slot', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordWebhook('product-update');
            const result = await metrics.getWebhookTimeline(3);

            const lastIdx = result.minutes.length - 1;
            expect(result.series['product-update'][lastIdx]).toBe(1);
        });
    });

    describe('getErrorTimeline', () => {
        it('returns empty structure when redis disabled', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub, false);

            const result = await metrics.getErrorTimeline(5);

            expect(result).toEqual({ minutes: [], counts: [] });
        });

        it('counts array matches minutes length', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            const result = await metrics.getErrorTimeline(10);

            expect(result.counts).toHaveLength(10);
        });
    });

    describe('getRecentErrors', () => {
        it('returns empty array when redis disabled', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub, false);

            const result = await metrics.getRecentErrors();

            expect(result).toEqual([]);
        });

        it('returns parsed error entries', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordError('ctx1', 'msg1');
            await metrics.recordError('ctx2', 'msg2');

            const result = await metrics.getRecentErrors(10);

            expect(result).toHaveLength(2);
            // newest first (lpush)
            expect(result[0].ctx).toBe('ctx2');
            expect(result[1].ctx).toBe('ctx1');
        });
    });

    describe('getLastHourTotals', () => {
        it('returns zeroed structure when redis disabled', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub, false);

            const result = await metrics.getLastHourTotals();

            expect(result.totalWebhooks).toBe(0);
            expect(result.totalDedup).toBe(0);
            expect(result.totalErrors).toBe(0);
            expect(result.dedupRate).toBe('0.0');
        });

        it('counts recorded events correctly', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordWebhook('product-update');
            await metrics.recordWebhook('product-update');
            await metrics.recordDedup('product-update');

            const result = await metrics.getLastHourTotals();

            expect(result.totalWebhooks).toBe(2);
            expect(result.totalDedup).toBe(1);
        });

        it('computes dedupRate as percentage string', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            // 1 webhook + 1 dedup → 1/(1+1)*100 = 50%
            await metrics.recordWebhook('product-update');
            await metrics.recordDedup('product-update');

            const result = await metrics.getLastHourTotals();

            expect(result.dedupRate).toBe('50.0');
        });
    });

    describe('getRequestTimeline', () => {
        it('returns empty structure when redis disabled', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub, false);

            const result = await metrics.getRequestTimeline(5);

            expect(result).toEqual({ minutes: [], series: {} });
        });

        it('records and reads back request counts', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordRequest('user-api');
            const result = await metrics.getRequestTimeline(2);

            const lastIdx = result.minutes.length - 1;
            expect(result.series['user-api'][lastIdx]).toBe(1);
        });
    });

    describe('getDiscountSyncTimeline', () => {
        it('returns empty structure when redis disabled', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub, false);

            const result = await metrics.getDiscountSyncTimeline(5);

            expect(result).toEqual({ minutes: [], syncs: [], docs: [] });
        });

        it('records and reads back discount sync', async () => {
            const stub = makeRedisStub();
            const metrics = loadMetrics(stub);

            await metrics.recordDiscountSync(10);
            const result = await metrics.getDiscountSyncTimeline(2);

            const lastIdx = result.minutes.length - 1;
            expect(result.syncs[lastIdx]).toBe(1);
            expect(result.docs[lastIdx]).toBe(10);
        });
    });
});
