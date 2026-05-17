'use strict';

const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');
const { processPendingPayment } = require('../adapters/pendingPayment');

/**
 * Process a verified Stripe webhook event. Idempotent — safe to call
 * multiple times for the same event (Stripe retries until 2xx).
 *
 * Currently handles `payment_intent.succeeded`. Other events are
 * acknowledged with a 200 but otherwise ignored.
 *
 * Rather than duplicating order-creation logic, this delegates to the
 * existing `processPendingPayment` adapter — the same path used by the
 * Tabby webhook — so email, inventory, coupon, and cart cleanup all
 * happen consistently.
 */
module.exports = async function handleStripeWebhook(event) {
    const Order = require('../../../repositories').orders.rawModel();
    const PendingPayment = require('../../../repositories').pendingPayments.rawModel();

    const type = event.type;

    if (type !== 'payment_intent.succeeded') {
        logger.debug(
            { eventType: type, eventId: event.id },
            '[StripeWebhook] event acknowledged but not handled'
        );
        return { handled: false, reason: `event type ${type} not handled` };
    }

    const paymentIntent = event.data.object;
    const paymentIntentId = paymentIntent.id;

    // Idempotency check — has the Order already been created (either by this
    // webhook on a prior retry, or by the mobile's /checkout-session call)?
    const existingOrder = await Order.findOne({
        stripe_checkout_session_id: paymentIntentId,
    }).lean();

    if (existingOrder) {
        logger.debug(
            { paymentIntentId, orderId: existingOrder._id },
            '[StripeWebhook] order already exists, skipping'
        );
        return { handled: true, orderId: existingOrder._id, skipped: 'already-exists' };
    }

    // Find the PendingPayment that the mobile's /stripe/init created.
    const pending = await PendingPayment.findOne({
        payment_id: paymentIntentId,
        status: 'pending',
    }).lean();

    if (!pending) {
        // Could be a stale event for a payment intent we don't have context
        // for (e.g. test event from Stripe CLI). Acknowledge and move on.
        logger.warn({ paymentIntentId }, '[StripeWebhook] no pending payment found, ignoring');
        await logBackendActivity({
            platform: 'Stripe Webhook',
            activity_name: 'No PendingPayment Match',
            status: 'warning',
            message: `payment_intent.succeeded for ${paymentIntentId} but no PendingPayment record exists`,
            execution_path: 'handleStripeWebhook',
        });
        return { handled: true, skipped: 'no-pending-record' };
    }

    // Delegate to the shared adapter that handles full order creation:
    // CartData, Order, OrderDetail, emails, inventory, coupon, cart cleanup.
    // processPendingPayment is already idempotent via the status field on
    // PendingPayment (pending → processing → completed | failed).
    await processPendingPayment(paymentIntentId, paymentIntent);

    // Re-fetch the created order for the response (processPendingPayment
    // doesn't return it directly).
    const createdOrder = await Order.findOne({
        stripe_checkout_session_id: paymentIntentId,
    }).lean();

    const orderId = createdOrder ? createdOrder._id : null;

    await logBackendActivity({
        platform: 'Stripe Webhook',
        activity_name: 'Order Created via Webhook',
        status: 'success',
        message: `Order ${orderId} created for PaymentIntent ${paymentIntentId}`,
        execution_path: 'handleStripeWebhook',
    });

    logger.info(
        { orderId, paymentIntentId },
        '[StripeWebhook] order created from webhook'
    );
    return { handled: true, orderId, createdViaWebhook: true };
};
