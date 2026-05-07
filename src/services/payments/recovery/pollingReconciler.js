'use strict';

/**
 * pollingReconciler.js — Polling reconciler for Nomod pending payments.
 *
 * Nomod has no webhooks. The only recovery mechanism for payments where the
 * user closed the app mid-flow (redirect interception never fired) is to
 * periodically poll Nomod's GET /v1/checkout/:id endpoint for all PendingPayment
 * records that are still in 'pending' status within a configurable lookback window.
 *
 * IDEMPOTENCY
 *   Running the reconciler twice for the same record is safe:
 *   - processPendingPayment uses atomic findOneAndUpdate({status:'pending'} → 'processing')
 *     as a CAS. If the verify path or a concurrent reconciler tick already claimed the
 *     record, the second caller gets null back and silently no-ops.
 *   - For cancelled/expired updates, the filter { status: 'pending' } ensures only the
 *     first writer wins.
 *
 * CONCURRENT SAFETY
 *   The reconciler is safe to run alongside live webhook/verify traffic. The atomic
 *   CAS in processPendingPayment guarantees exactly one order is created regardless of
 *   which path wins the race.
 *
 * BOUNDEDNESS
 *   Only processes records created within the last `lookbackMinutes` minutes and
 *   processes at most `batchSize` records per tick. This prevents unbounded retries
 *   and keeps each cron tick O(batchSize).
 */

const { acquireLock, releaseLock } = require('./reconcilerLock');

/**
 * Reconcile pending payments for a single cron tick.
 *
 * All dependencies are injected to keep this function pure and fully testable.
 *
 * @param {Object} opts
 * @param {Object}   opts.PendingPayment       - Mongoose model (or compatible repo)
 * @param {Object}   opts.providerFactory      - PaymentProviderFactory (static .create(name))
 * @param {Function} opts.processPendingPayment - Atomic adapter from wave 3
 * @param {Object}   opts.logger               - Pino-compatible logger
 * @param {Function} [opts.clock]              - () => Date — clock seam; defaults to () => new Date()
 * @param {Object}   [opts.config]             - Reconciler tuning knobs
 * @param {number}   [opts.config.lookbackMinutes=60]   - Only look at records within this window
 * @param {number}   [opts.config.batchSize=50]         - Max records to process per tick
 * @param {string}   [opts.config.lockKey]              - Redis lock key
 * @param {number}   [opts.config.lockTtlSeconds=240]   - Redis lock TTL
 *
 * @returns {Promise<{
 *   skipped?: string,
 *   processed: number,
 *   paid: number,
 *   cancelled: number,
 *   expired: number,
 *   pending: number,
 *   errors: Array<{paymentId: string, error: string}>,
 * }>}
 */
async function reconcilePendingPayments({
    PendingPayment,
    providerFactory,
    processPendingPayment,
    logger,
    clock = () => new Date(),
    config = {},
} = {}) {
    const {
        lookbackMinutes = 60,
        batchSize = 50,
        lockKey = 'reconciler:payment:lock:v1',
        lockTtlSeconds = 240,
    } = config;

    // ── 1. Distributed lock ──────────────────────────────────────────────────
    const token = await acquireLock(lockKey, lockTtlSeconds);
    if (token === null) {
        logger.info('[Reconciler] Lock not acquired — another instance is running this tick');
        return { skipped: 'lock-not-acquired', processed: 0, paid: 0, cancelled: 0, expired: 0, pending: 0, errors: [] };
    }

    const counts = { processed: 0, paid: 0, cancelled: 0, expired: 0, pending: 0 };
    const errors = [];

    try {
        // ── 2. Fetch pending records within the lookback window ──────────────
        const cutoff = new Date(clock().getTime() - lookbackMinutes * 60 * 1000);

        const records = await PendingPayment.find({
            status: 'pending',
            createdAt: { $gt: cutoff },
        })
            .sort({ createdAt: 1 })
            .limit(batchSize)
            .lean();

        // ── 3. Process each record ───────────────────────────────────────────
        for (const record of records) {
            const paymentId = record.payment_id;
            const paymentMethod = record.payment_method;

            try {
                // Get the provider for this payment method
                let provider;
                try {
                    provider = providerFactory.create(paymentMethod);
                } catch (factoryErr) {
                    logger.warn(
                        { paymentId, paymentMethod, err: factoryErr.message },
                        '[Reconciler] Unknown payment method — skipping',
                    );
                    errors.push({ paymentId, error: `unknown_provider: ${factoryErr.message}` });
                    counts.processed++;
                    continue;
                }

                // Providers that don't implement queryPaymentState are not recoverable
                if (typeof provider.queryPaymentState !== 'function') {
                    counts.pending++;
                    counts.processed++;
                    continue;
                }

                const result = await provider.queryPaymentState(paymentId);
                const { terminalState, raw } = result;

                switch (terminalState) {
                    case 'paid':
                        await processPendingPayment(paymentId, raw);
                        logger.info({ paymentId }, '[Reconciler] created order for recovered payment');
                        counts.paid++;
                        break;

                    case 'cancelled':
                        await PendingPayment.findOneAndUpdate(
                            { payment_id: paymentId, status: 'pending' },
                            { $set: { status: 'cancelled', cancelledAt: clock() } },
                        );
                        logger.info({ paymentId }, '[Reconciler] marked payment cancelled');
                        counts.cancelled++;
                        break;

                    case 'expired':
                        await PendingPayment.findOneAndUpdate(
                            { payment_id: paymentId, status: 'pending' },
                            { $set: { status: 'expired', expiredAt: clock() } },
                        );
                        logger.info({ paymentId }, '[Reconciler] marked payment expired');
                        counts.expired++;
                        break;

                    case 'pending':
                        // No terminal state yet — will retry next tick
                        counts.pending++;
                        break;

                    case 'unknown':
                    default:
                        // Provider returned unclassifiable data — log for ops and retry next tick
                        logger.warn(
                            { paymentId, reason: result.reason },
                            '[Reconciler] unknown payment state — will retry next tick',
                        );
                        counts.pending++;
                        break;
                }

                counts.processed++;
            } catch (recordErr) {
                // Per-record errors must not abort the entire batch
                logger.error(
                    { paymentId, err: recordErr.message || recordErr },
                    '[Reconciler] error processing record — continuing batch',
                );
                errors.push({ paymentId, error: recordErr.message || String(recordErr) });
                counts.processed++;
            }
        }
    } finally {
        // ── 4. Always release the lock ───────────────────────────────────────
        await releaseLock(lockKey, token);
    }

    return { ...counts, errors };
}

module.exports = { reconcilePendingPayments };
