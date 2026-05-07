'use strict';

// NOTE (Wave 1): toE164 is imported here in preparation for the customer block.
// If the customer block passed to provider.createCheckout is re-enabled (see the
// comment at NomodProvider.js line ~120), normalise the phone number first:
//   const { toE164 } = require('../../../utilities/phone');
//   customer.phone = toE164(phone) || phone;
// Nomod's API requires E.164 format (+971XXXXXXXXX). Raw UAE numbers like
// "0501234567" will cause validation errors. Do NOT pass un-normalised phone numbers.

const PaymentProviderFactory = require('../../payments/PaymentProviderFactory');
const PendingPayment = require('../../../repositories').pendingPayments.rawModel();
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

const RETURN_URL_BASE =
    process.env.NOMOD_RETURN_URL_BASE ||
    'https://app.bazaar-uae.com/payments/nomod/return';

module.exports = async function createNomodCheckoutSession(userId, bodyData, metadata) {
    const {
        cartData = [],
        total,
        sub_total,
        currency = 'AED',
        discountAmount = 0,
        couponCode,
        shippingCost = 0,
        name,
        phone,
        address,
        state,
        city,
        area,
        country,
        floorNo,
        buildingName,
        apartmentNo,
        landmark,
        mobileNumber,
        user_email,
    } = bodyData || {};

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Nomod Create Session',
        status: 'success',
        message: `Nomod createNomodCheckoutSession API hit - user: ${userId || 'n/a'}, email: ${user_email || 'n/a'}`,
        execution_path: 'orderService.createNomodCheckoutSession (initial)',
    });

    // Required-field validation
    if (!Array.isArray(cartData) || cartData.length === 0) {
        throw { status: 400, message: 'cartData must be a non-empty array' };
    }
    if (total == null || Number(total) <= 0) {
        throw { status: 400, message: 'total is required and must be > 0' };
    }
    if (!process.env.NOMOD_API_KEY) {
        throw { status: 500, message: 'Nomod is not configured on the server' };
    }

    const referenceId = `mobile-${userId}-${clock.nowMs()}`;

    const provider = PaymentProviderFactory.create('nomod');
    let checkout;
    try {
        checkout = await provider.createCheckout({
            referenceId,
            amount: Number(total),
            currency: (currency || 'AED').toUpperCase(),
            discount: Number(discountAmount) || 0,
            items: cartData.map((item, idx) => ({
                id: item.variantId || item.id || `item-${idx + 1}`,
                name: item.name || 'Product',
                quantity: item.qty ?? 1,
                price: item.price,
            })),
            shippingCost: Number(shippingCost) || 0,
            // Redirect URLs: HTTPS pattern so the mobile WebView's NavigationDelegate
            // can intercept them regardless of whether Nomod follows custom schemes.
            // The mobile WebView also intercepts bazaaruae:// as a fallback.
            successUrl: `${RETURN_URL_BASE}?status=success&payment_id={CHECKOUT_ID}`,
            failureUrl: `${RETURN_URL_BASE}?status=failure&payment_id={CHECKOUT_ID}`,
            cancelledUrl: `${RETURN_URL_BASE}?status=cancelled&payment_id={CHECKOUT_ID}`,
            metadata: {
                user_id: String(userId),
                orderfrom: 'Mobile App',
                name: String(name || ''),
                phone: String(phone || ''),
                address: String(address || ''),
                city: String(city || ''),
            },
        });
    } catch (err) {
        logger.warn({ err: err.message, userId }, '[Nomod] checkout creation failed');
        throw { status: err.status || 502, message: `Nomod session creation failed: ${err.message}` };
    }

    const _now = clock.now();
    const formatDate = _now.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai',
    });
    const formatTime = _now.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai',
    });
    const orderTime = `${formatDate}, ${formatTime}`;

    await PendingPayment.create({
        user_id: userId,
        payment_id: checkout.id,
        payment_method: 'nomod',
        order_data: {
            cartData,
            total,
            sub_total,
            currency,
            discountAmount,
            couponCode,
            shippingCost,
            name,
            phone,
            address,
            state,
            city,
            area,
            country,
            floorNo,
            buildingName,
            apartmentNo,
            landmark,
            mobileNumber,
            user_email,
        },
        status: 'pending',
        orderfrom: 'Mobile App',
        orderTime,
    });

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Nomod Create Session',
        status: 'success',
        message: `Created Nomod checkout ${checkout.id} for user ${userId}`,
        execution_path: 'orderService.createNomodCheckoutSession',
    });

    logger.info({ checkoutId: checkout.id, userId }, '[Nomod] checkout session created (mobile)');

    return {
        checkout_url: checkout.redirectUrl,
        payment_id: checkout.id,
        status: 'created',
    };
};
