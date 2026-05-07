'use strict';

/**
 * Server-side Tabby session creation. Mobile clients hit this instead of
 * calling Tabby's `/api/v2/checkout` directly with a secret key.
 *
 * Mobile sends:
 *   { amount, currency, items: [{ id, name, qty, price, variant?, category? }],
 *     lang? ('en'|'ar'), addressOverride? (full address obj if user picked
 *     a non-primary saved address) }
 *
 * Backend:
 *   - Pulls buyer info + saved addresses + payment history from the user record
 *   - Builds Tabby's full Payment payload
 *   - Calls Tabby with TABBY_SECRET_KEY (server-only)
 *   - Returns { paymentId, status, webUrl, isRejected, rejectionReason? }
 */

const axios = require('axios');
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

const TABBY_BASE = 'https://api.tabby.ai';

module.exports = async function createTabbySession(userId, bodyData) {
    const {
        amount,
        currency = 'AED',
        items = [],
        lang = 'en',
        addressOverride,
    } = bodyData || {};

    if (!userId) {
        throw { status: 401, message: 'Authentication required' };
    }
    if (amount == null || Number.isNaN(Number(amount))) {
        throw { status: 400, message: 'amount is required' };
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw { status: 400, message: 'items must be a non-empty array' };
    }
    if (!process.env.TABBY_SECRET_KEY) {
        throw { status: 500, message: 'Tabby is not configured on the server' };
    }

    const User = require('../../../repositories').users.rawModel();
    const user = await User.findById(userId).lean();
    if (!user) throw { status: 404, message: 'User not found' };

    const primaryAddress =
        addressOverride ||
        (Array.isArray(user.address) && user.address.find(a => a.isPrimary)) ||
        (Array.isArray(user.address) && user.address[0]) ||
        {};

    const buyerHistory = await buildBuyerHistory(user);
    const orderHistory = await buildOrderHistory(userId);

    const tabbyPayload = {
        merchant_code: process.env.TABBY_MERCHANT_CODE || 'BGTAPP',
        lang: lang === 'ar' ? 'ar' : 'en',
        payment: {
            amount: Number(amount).toFixed(2),
            currency: currency.toUpperCase(),
            buyer: {
                email: user.email || '',
                phone: user.phone || user.mobile || '',
                name: user.name || '',
            },
            buyer_history: buyerHistory,
            shipping_address: {
                city: primaryAddress.city || '',
                address: composeAddressLine(primaryAddress),
                zip: primaryAddress.city || '',
            },
            order: {
                reference_id: `Order-${clock.now().toISOString()}`,
                items: items.map(it => ({
                    title: it.name || it.title || '',
                    description: it.description || it.name || '',
                    quantity: it.qty || it.quantity || 1,
                    unit_price: String(it.price ?? '0'),
                    reference_id: it.id || it.productId || '',
                    product_url: it.product_url ||
                        `https://www.bazaar-uae.com/product-details/${it.variantId || it.id || ''}`,
                    category: it.category || '',
                })),
            },
            order_history: orderHistory,
        },
    };

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Tabby Create Session',
        status: 'in_progress',
        message: `Creating Tabby session for user ${userId}, amount ${amount} ${currency}`,
        execution_path: 'orderController.createTabbySession',
    });

    let response;
    try {
        response = await axios.post(
            `${TABBY_BASE}/api/v2/checkout`,
            tabbyPayload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            }
        );
    } catch (err) {
        const status = err.response?.status || 502;
        const tabbyMessage = err.response?.data?.error || err.message;
        logger.warn({ status, tabbyMessage, userId }, '[Tabby] session create failed');
        throw {
            status,
            message: `Tabby session creation failed: ${tabbyMessage}`,
        };
    }

    const session = response.data || {};
    const installments = session?.configuration?.available_products?.installments;
    const webUrl = Array.isArray(installments) && installments.length > 0
        ? installments[0].web_url
        : null;

    const sessionStatus = (session.status || '').toLowerCase();
    const isRejected = sessionStatus === 'rejected';

    return {
        paymentId: session.payment?.id || null,
        status: sessionStatus,
        webUrl,
        isRejected,
        rejectionReason: isRejected
            ? (session.configuration?.available_products?.installments_rejection_reason
                || session.rejection_reason
                || null)
            : null,
    };
};

function composeAddressLine(addr) {
    if (!addr) return '';
    const parts = [];
    if (addr.floorNo) parts.push(`Floor: ${addr.floorNo}`);
    if (addr.apartmentNo) parts.push(`Apt: ${addr.apartmentNo}`);
    if (addr.buildingName) parts.push(addr.buildingName);
    if (addr.landmark) parts.push(`Near: ${addr.landmark}`);
    if (addr.area) parts.push(addr.area);
    if (addr.city) parts.push(addr.city);
    if (addr.state) parts.push(addr.state);
    if (addr.country) parts.push(addr.country);
    if (addr.address && !parts.length) return addr.address;
    return parts.join(', ');
}

async function buildBuyerHistory(user) {
    return {
        registered_since: (user.createdAt || clock.now()).toISOString(),
        loyalty_level: user.loyaltyLevel || 0,
        wishlist_count: 0,
        is_email_verified: null,
        is_phone_number_verified: null,
        is_social_networks_connected: null,
    };
}

async function buildOrderHistory(userId) {
    try {
        const Order = require('../../../repositories').orders?.rawModel?.();
        if (!Order) return [];

        const orders = await Order.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        return orders.map(o => ({
            amount: String(o.total || o.amount || 0),
            purchased_at: (o.createdAt || clock.now()).toISOString(),
            payment_method: 'card',
            status: 'new',
            buyer: {
                email: o.email || '',
                phone: o.phone || o.mobileNumber || '',
                name: o.name || '',
            },
            shipping_address: {
                city: o.city || '',
                address: o.address || '',
                zip: o.city || '',
            },
        }));
    } catch (err) {
        logger.debug({ err: err.message }, '[Tabby] could not build order history');
        return [];
    }
}
