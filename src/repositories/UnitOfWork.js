/**
 * UnitOfWork — sanctioned mechanism for multi-document transactions.
 *
 * Wraps `mongoose.startSession()` + `session.withTransaction()` so services
 * never call those APIs directly. Repository methods accept `{ session }` and
 * the session is threaded through every write inside the callback.
 *
 * Usage:
 *   await unitOfWork.runInTransaction(async (session) => {
 *     await repos.orders.create(orderData, { session });
 *     await repos.products.decrementStock(productId, qty, { session });
 *   });
 *
 * If MongoDB is not configured as a replica set (e.g. local dev), transactions
 * are unavailable. The helper detects this and falls back to running the
 * callback without a session — callers must understand this trades atomicity
 * for availability in non-prod environments.
 */
const mongoose = require('mongoose');

const logger = require('../utilities/logger');

class UnitOfWork {
    constructor() {
        this._supportsTransactions = null;
    }

    /**
     * @template T
     * @param {(session: import('mongoose').ClientSession | null) => Promise<T>} fn
     * @param {{ readPreference?: string }} [opts]
     * @returns {Promise<T>}
     */
    async runInTransaction(fn, opts = {}) {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            throw new Error('UnitOfWork: mongoose not connected');
        }

        let session;
        try {
            session = await mongoose.startSession();
        } catch (err) {
            logger.warn({ err }, 'UnitOfWork: startSession failed, running without transaction');
            return fn(null);
        }

        try {
            let result;
            await session.withTransaction(async () => {
                result = await fn(session);
            }, opts);
            return result;
        } catch (err) {
            // Standalone Mongo (not a replica set) rejects transactions with
            // code 20 / message containing "Transaction numbers". Retry without.
            const msg = String(err && err.message || '');
            const isStandalone =
                err && (err.code === 20 || msg.includes('Transaction numbers') || msg.includes('replica set'));
            if (isStandalone) {
                logger.warn('UnitOfWork: transactions unsupported on this MongoDB deployment, running without');
                return fn(null);
            }
            throw err;
        } finally {
            try { await session.endSession(); } catch (_) { /* noop */ }
        }
    }
}

module.exports = new UnitOfWork();
