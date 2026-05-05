#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Payments diagnostic — Stripe + Tabby, last 24 hours. Read-only.
 *
 * Stripe: lists Checkout Sessions + PaymentIntents created in the window via Stripe API.
 * Tabby:  reads local PendingPayment rows (payment_method='tabby') created in the window,
 *         then verifies each one against Tabby's GET /payments/{id} endpoint.
 *
 * Tabby has no public "list payments" API, so the local DB is authoritative for which
 * payments to check; Tabby API is queried per-payment for ground truth.
 *
 * Usage:
 *   node scripts/payments-24h-diagnostic.js
 *   node scripts/payments-24h-diagnostic.js --hours=48
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { STRIPE_AMOUNT_MULTIPLIER } = require('../src/config/constants/money');

const args = process.argv.slice(2).reduce((acc, raw) => {
    const [k, v] = raw.replace(/^--/, '').split('=');
    acc[k] = v ?? true;
    return acc;
}, {});

const HOURS = Number(args.hours) || 24;
const SINCE_MS = Date.now() - HOURS * 60 * 60 * 1000;
const SINCE_UNIX = Math.floor(SINCE_MS / 1000);
const SINCE_DATE = new Date(SINCE_MS);

const fmtMoney = (amount, currency) => {
    if (amount == null) return 'n/a';
    return `${(amount / STRIPE_AMOUNT_MULTIPLIER).toFixed(2)} ${(currency || '').toUpperCase()}`;
};
const fmtUnix = (u) => (u ? new Date(u * 1000).toISOString() : 'n/a');

async function checkStripe() {
    const sk = process.env.STRIPE_SK;
    if (!sk) {
        console.log('\n=== Stripe — SKIPPED (STRIPE_SK not set) ===');
        return;
    }
    const mode = sk.startsWith('sk_live_') ? 'LIVE' : sk.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN';
    const stripe = require('stripe')(sk);

    console.log(`\n=== Stripe (${mode} mode) — last ${HOURS}h ===`);

    const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        created: { gte: SINCE_UNIX },
    });
    const intents = await stripe.paymentIntents.list({
        limit: 100,
        created: { gte: SINCE_UNIX },
    });

    console.log(`Checkout Sessions: ${sessions.data.length}`);
    sessions.data.forEach((s) => {
        console.log({
            id: s.id,
            sessionStatus: s.status,
            paymentStatus: s.payment_status,
            amount: fmtMoney(s.amount_total, s.currency),
            created: fmtUnix(s.created),
            referenceId: s.metadata?.reference_id || null,
            paymentIntent: s.payment_intent || null,
        });
    });

    console.log(`PaymentIntents: ${intents.data.length}`);
    intents.data.forEach((pi) => {
        console.log({
            id: pi.id,
            status: pi.status,
            amount: fmtMoney(pi.amount, pi.currency),
            received: fmtMoney(pi.amount_received, pi.currency),
            created: fmtUnix(pi.created),
            referenceId: pi.metadata?.reference_id || null,
            lastError: pi.last_payment_error?.message || null,
        });
    });

    const paid = sessions.data.filter((s) => s.payment_status === 'paid');
    const totalPaid = paid.reduce((sum, s) => sum + (s.amount_total || 0), 0);
    console.log('Stripe summary:', {
        sessions: sessions.data.length,
        paid: paid.length,
        expired: sessions.data.filter((s) => s.status === 'expired').length,
        capturedAmount: fmtMoney(totalPaid, paid[0]?.currency || 'aed'),
    });
}

async function checkTabby() {
    const auth = process.env.TABBY_SECRET_KEY || process.env.TABBY_AUTH_KEY;
    if (!auth) {
        console.log('\n=== Tabby — SKIPPED (TABBY_SECRET_KEY not set) ===');
        return;
    }
    if (!process.env.MONGO_URI) {
        console.log('\n=== Tabby — SKIPPED (MONGO_URI not set; cannot read PendingPayment) ===');
        return;
    }

    console.log(`\n=== Tabby — last ${HOURS}h ===`);
    await mongoose.connect(process.env.MONGO_URI);

    const PendingPayment = mongoose.connection.db.collection('pendingpayments');
    const rows = await PendingPayment.find({
        payment_method: 'tabby',
        created_at: { $gte: SINCE_DATE },
    }).sort({ created_at: -1 }).toArray();

    console.log(`Local PendingPayment rows (tabby): ${rows.length}`);

    if (!rows.length) {
        console.log('(no Tabby payments in window)');
        return;
    }

    const results = [];
    for (const row of rows) {
        let liveStatus = null;
        let liveAmount = null;
        let liveCurrency = null;
        let error = null;

        const endpoints = [
            `https://api.tabby.ai/api/v2/payments/${row.payment_id}`,
            `https://api.tabby.ai/api/v2/checkout/${row.payment_id}`,
        ];
        let probedEndpoint = null;
        for (const url of endpoints) {
            try {
                const res = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
                if (res.ok) {
                    const body = await res.json();
                    liveStatus = body.status;
                    liveAmount = body.amount || body.payment?.amount;
                    liveCurrency = body.currency || body.payment?.currency;
                    probedEndpoint = url.includes('/checkout/') ? 'checkout' : 'payments';
                    error = null;
                    break;
                } else {
                    error = `HTTP ${res.status}`;
                }
            } catch (e) {
                error = e.message;
            }
        }

        results.push({
            paymentId: row.payment_id,
            localStatus: row.status,
            tabbyStatus: liveStatus,
            amount: liveAmount ? `${liveAmount} ${liveCurrency}` : 'n/a',
            createdAt: row.created_at?.toISOString(),
            webhookReceived: row.webhook_received,
            webhookStatus: row.webhook_status,
            drift: liveStatus && !statusesMatch(row.status, liveStatus) ? 'YES' : 'no',
            probedEndpoint,
            error,
        });
    }

    results.forEach((r) => console.log(r));

    const drifted = results.filter((r) => r.drift === 'YES');
    console.log('Tabby summary:', {
        total: results.length,
        completed: results.filter((r) => r.localStatus === 'completed').length,
        pending: results.filter((r) => r.localStatus === 'pending').length,
        failed: results.filter((r) => r.localStatus === 'failed').length,
        drifted: drifted.length,
    });

    await mongoose.disconnect();
}

function statusesMatch(local, tabby) {
    if (!local || !tabby) return true;
    const t = tabby.toUpperCase();
    if (local === 'completed') return t === 'CLOSED' || t === 'AUTHORIZED';
    if (local === 'failed') return t === 'REJECTED' || t === 'EXPIRED';
    if (local === 'pending' || local === 'processing') return t === 'CREATED' || t === 'AUTHORIZED';
    return true;
}

(async () => {
    console.log(`Window: since ${SINCE_DATE.toISOString()} (${HOURS}h)`);
    try {
        await checkStripe();
        await checkTabby();
        console.log('\nDone.');
    } catch (err) {
        console.error('Diagnostic failed:', err.stack || err.message || err);
        try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
        process.exit(1);
    }
})();
