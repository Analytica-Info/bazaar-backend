const PaymentProvider = require('./PaymentProvider');
const logger = require('../../utilities/logger');

const stripe = require('stripe')(process.env.STRIPE_SK);

class StripeProvider extends PaymentProvider {
    constructor() {
        super('stripe');
    }

    async createCheckout({
        referenceId, amount, currency = 'AED', discount = 0,
        items, shippingCost = 0, customer, successUrl, failureUrl, cancelledUrl, metadata = {},
    }) {
        const lineItems = items.map(item => ({
            price_data: {
                currency: currency.toLowerCase(),
                product_data: { name: item.name || 'Product', description: item.variant || '' },
                unit_amount: Math.round(Number(item.price) * 100),
            },
            quantity: Number(item.quantity) || 1,
        }));

        if (shippingCost > 0) {
            lineItems.push({
                price_data: {
                    currency: currency.toLowerCase(),
                    product_data: { name: 'Shipping Cost' },
                    unit_amount: Math.round(Number(shippingCost) * 100),
                },
                quantity: 1,
            });
        }

        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'payment',
                success_url: successUrl || `${process.env.URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelledUrl || failureUrl || `${process.env.URL}/failed`,
                metadata: { reference_id: referenceId, ...metadata },
            });

            logger.info({ sessionId: session.id, referenceId }, 'Stripe checkout created');
            return { id: session.id, redirectUrl: session.url, raw: session };
        } catch (error) {
            logger.error({ err: error }, 'Stripe createCheckout failed');
            throw { status: 500, message: error.message || 'Failed to create Stripe checkout' };
        }
    }

    async getCheckout(sessionId) {
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            const paid = session.payment_status === 'paid';
            return {
                id: session.id,
                status: paid ? 'paid' : session.status, // complete, expired, open
                paid,
                amount: session.amount_total / 100,
                currency: session.currency?.toUpperCase(),
                raw: session,
            };
        } catch (error) {
            throw { status: error.statusCode || 500, message: error.message || 'Failed to retrieve Stripe session' };
        }
    }

    async refund(sessionId, { amount, reason, referenceId } = {}) {
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            const paymentIntentId = session.payment_intent;

            if (!paymentIntentId) {
                throw { status: 400, message: 'No payment intent found for this session' };
            }

            const refundParams = { payment_intent: paymentIntentId };
            if (amount) refundParams.amount = Math.round(Number(amount) * 100);
            if (reason) refundParams.reason = reason;

            const refund = await stripe.refunds.create(refundParams);
            logger.info({ sessionId, refundId: refund.id, amount }, 'Stripe refund created');

            return {
                refundId: refund.id,
                status: refund.status, // succeeded, pending, failed, canceled
                amount: refund.amount / 100,
                raw: refund,
            };
        } catch (error) {
            throw { status: error.statusCode || 500, message: error.message || 'Failed to create Stripe refund' };
        }
    }

    async cancelCheckout(sessionId) {
        try {
            await stripe.checkout.sessions.expire(sessionId);
            logger.info({ sessionId }, 'Stripe checkout expired');
        } catch (error) {
            throw { status: error.statusCode || 500, message: error.message || 'Failed to cancel Stripe session' };
        }
    }

    async handleWebhook(payload, headers) {
        const sig = headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;
        try {
            event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
        } catch (error) {
            throw { status: 400, message: `Webhook signature verification failed: ${error.message}` };
        }

        const session = event.data.object;
        let normalizedEvent = 'unknown';
        let status = null;

        switch (event.type) {
            case 'checkout.session.completed':
                normalizedEvent = 'payment.success';
                status = 'paid';
                break;
            case 'checkout.session.expired':
                normalizedEvent = 'payment.expired';
                status = 'expired';
                break;
            case 'charge.refunded':
                normalizedEvent = 'refund.completed';
                status = 'refunded';
                break;
        }

        return { event: normalizedEvent, sessionId: session.id, status, raw: event };
    }
}

module.exports = StripeProvider;
