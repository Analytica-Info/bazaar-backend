/* eslint-disable no-console */
/**
 * Stripe diagnostic script — read-only.
 *
 * Reports:
 *   1. Account info        (stripe.accounts.retrieve)
 *   2. Recent payments     (stripe.paymentIntents.list)
 *   3. Recent checkout     (stripe.checkout.sessions.list) — what this app actually creates
 *
 * Usage:
 *   node src/scripts/stripeDiagnostic.js                 # last 10 of each
 *   node src/scripts/stripeDiagnostic.js --limit=25
 *   node src/scripts/stripeDiagnostic.js --session=cs_test_...
 *   node src/scripts/stripeDiagnostic.js --intent=pi_...
 *
 * Requires STRIPE_SK in env (same var the app uses in src/services/payments/StripeProvider.js).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { STRIPE_AMOUNT_MULTIPLIER } = require('../src/config/constants/money');

const STRIPE_SK = process.env.STRIPE_SK;
if (!STRIPE_SK) {
    console.error('ERROR: STRIPE_SK not set in environment.');
    process.exit(1);
}

const stripe = require('stripe')(STRIPE_SK);

const args = process.argv.slice(2).reduce((acc, raw) => {
    const [k, v] = raw.replace(/^--/, '').split('=');
    acc[k] = v ?? true;
    return acc;
}, {});

const LIMIT = Math.min(Number(args.limit) || 10, 100);

const fmtMoney = (amount, currency) => {
    if (amount == null) return 'n/a';
    return `${(amount / STRIPE_AMOUNT_MULTIPLIER).toFixed(2)} ${(currency || '').toUpperCase()}`;
};

const fmtTime = (unix) => (unix ? new Date(unix * 1000).toISOString() : 'n/a');

const mode = STRIPE_SK.startsWith('sk_live_') ? 'LIVE' : STRIPE_SK.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN';

async function showAccount() {
    console.log(`\n=== Stripe Account (${mode} mode) ===`);
    const account = await stripe.accounts.retrieve();
    console.log({
        id: account.id,
        email: account.email,
        country: account.country,
        defaultCurrency: account.default_currency?.toUpperCase(),
        businessType: account.business_type,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        displayName: account.settings?.dashboard?.display_name,
    });

    const balance = await stripe.balance.retrieve();
    console.log('Balance:');
    console.log('  available:', balance.available.map(b => fmtMoney(b.amount, b.currency)).join(', '));
    console.log('  pending:  ', balance.pending.map(b => fmtMoney(b.amount, b.currency)).join(', '));
}

async function showPaymentIntents() {
    console.log(`\n=== Recent PaymentIntents (last ${LIMIT}) ===`);
    const { data } = await stripe.paymentIntents.list({ limit: LIMIT });
    if (!data.length) {
        console.log('(none)');
        return;
    }
    data.forEach((pi) => {
        console.log({
            id: pi.id,
            status: pi.status, // requires_payment_method | requires_confirmation | processing | succeeded | canceled | requires_action
            amount: fmtMoney(pi.amount, pi.currency),
            received: fmtMoney(pi.amount_received, pi.currency),
            created: fmtTime(pi.created),
            referenceId: pi.metadata?.reference_id || null,
            lastError: pi.last_payment_error?.message || null,
        });
    });
}

async function showCheckoutSessions() {
    console.log(`\n=== Recent Checkout Sessions (last ${LIMIT}) ===`);
    const { data } = await stripe.checkout.sessions.list({ limit: LIMIT });
    if (!data.length) {
        console.log('(none)');
        return;
    }
    data.forEach((s) => {
        console.log({
            id: s.id,
            sessionStatus: s.status,           // open | complete | expired
            paymentStatus: s.payment_status,   // paid | unpaid | no_payment_required
            amount: fmtMoney(s.amount_total, s.currency),
            created: fmtTime(s.created),
            referenceId: s.metadata?.reference_id || null,
            paymentIntent: s.payment_intent || null,
        });
    });
}

async function showOne() {
    if (args.session) {
        console.log(`\n=== Checkout Session ${args.session} ===`);
        const s = await stripe.checkout.sessions.retrieve(args.session);
        console.log({
            id: s.id,
            sessionStatus: s.status,
            paymentStatus: s.payment_status,
            amount: fmtMoney(s.amount_total, s.currency),
            customerEmail: s.customer_details?.email,
            referenceId: s.metadata?.reference_id || null,
            paymentIntent: s.payment_intent,
        });
    }
    if (args.intent) {
        console.log(`\n=== PaymentIntent ${args.intent} ===`);
        const pi = await stripe.paymentIntents.retrieve(args.intent);
        console.log({
            id: pi.id,
            status: pi.status,
            amount: fmtMoney(pi.amount, pi.currency),
            received: fmtMoney(pi.amount_received, pi.currency),
            charges: pi.charges?.data?.length || 0,
            lastError: pi.last_payment_error?.message || null,
        });
    }
}

(async () => {
    try {
        await showAccount();
        if (args.session || args.intent) {
            await showOne();
        } else {
            await showCheckoutSessions();
            await showPaymentIntents();
        }
        console.log('\nDone.');
    } catch (err) {
        console.error('Stripe diagnostic failed:', err.message);
        if (err.type) console.error('  type:', err.type);
        if (err.code) console.error('  code:', err.code);
        process.exit(1);
    }
})();
