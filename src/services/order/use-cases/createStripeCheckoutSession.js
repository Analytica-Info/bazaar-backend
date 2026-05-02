'use strict';

const crypto = require("crypto");
const CartData = require('../../../repositories').cartData.rawModel();
const Cart = require('../../../repositories').carts.rawModel();
const Order = require('../../../repositories').orders.rawModel();
const OrderDetail = require('../../../repositories').orderDetails.rawModel();
const CouponMobile = require('../../../repositories').couponsMobile.rawModel();
const User = require('../../../repositories').users.rawModel();
const PendingPayment = require('../../../repositories').pendingPayments.rawModel();
const { sendEmail } = require('../../../mail/emailService');
const { logActivity } = require('../../../utilities/activityLogger');
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');
const cache = require('../../../utilities/cache');
const { normalizeCartDataWithGifts, applyGiftLogic } = require('../domain/cartNormalization');
const { buildAdminOrderEmailHtml, buildUserOrderEmailHtml } = require('../domain/emailTemplates');
const { updateQuantities } = require('../shared/quantities');
const markCouponUsed = require('./markCouponUsed');

// Private internal helper — not the same as the public exports.verifyTabbyPayment
async function verifyTabbyPaymentInternal(paymentId) {
    const axios = require('axios');
    try {
        if (!paymentId) {
            return {
                status: false,
                finalStatus: 'missing_payment_id',
                message: 'paymentId is required',
            };
        }

        const paymentResp = await axios.get(`https://api.tabby.ai/api/v2/payments/${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}`
            }
        });

        const payment = paymentResp.data;
        const status = payment.status?.toUpperCase();

        const pkTime = clock.now().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
        logger.debug({ pkTime }, 'pkTime');
        logger.debug({ status }, 'verifyTabbyPayment :: status');

        if (status === 'AUTHORIZED') {
            const captureResp = await axios.post(
                `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
                { amount: payment.amount },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}`
                    }
                }
            );

            const captureStatus = captureResp.data.status?.toUpperCase();
            if (captureStatus !== 'CLOSED') {
                return {
                    status: false,
                    finalStatus: captureStatus || 'UNKNOWN',
                    message: 'Capture failed'
                };
            }

            return {
                status: true,
                finalStatus: 'CLOSED'
            };
        }

        return {
            status: status === 'CLOSED',
            finalStatus: status,
            message: `Payment status is ${status}`
        };

    } catch (error) {
        console.error('Tabby Payment error:', error?.response?.data || error.message);
        const pkTime = clock.now().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
        logger.debug({ pkTime }, 'pkTime');
        logger.debug({ status: error?.response?.data || error.message }, 'verifyTabbyPayment :: status');

        return {
            status: false,
            finalStatus: 'failed',
            message: 'Tabby verification error'
        };
    }
}

const ENVIRONMENT = process.env.ENVIRONMENT;

module.exports = async function createStripeCheckoutSession(userId, bodyData, metadata) {
    const {
        cartData,
        shippingCost,
        name,
        phone,
        address,
        state,
        city,
        area,
        floorNo,
        buildingName,
        apartmentNo,
        landmark,
        currency,
        discountPercent,
        discountAmount,
        couponCode,
        payment_method,
        mobileNumber,
        paymentIntentId,
        txnId,
        paymentStatus,
        user_email,
        total,
        sub_total,
    } = bodyData;
    const user_id = userId;
    const fcmToken = metadata?.fcmToken || null;

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Checkout Session API Hit',
        status: 'success',
        message: `Stripe checkoutSession API hit - user: ${user_id || 'n/a'}, email: ${user_email || 'n/a'}, payment_method: ${payment_method || 'n/a'}. Order data: cartData, shippingCost, name, phone, address, state, city, area, floorNo, buildingName, apartmentNo, landmark, currency, discountPercent, discountAmount, couponCode, mobileNumber, user_email, total, sub_total, txnId, paymentStatus, fcmToken`,
        execution_path: 'orderController.checkoutSession (initial)'
    });

    let normalizedCartData = normalizeCartDataWithGifts(cartData);
    normalizedCartData = await applyGiftLogic(normalizedCartData);
    const cartDataToUse = normalizedCartData;

    if (payment_method === 'stripe') {
        if (!paymentIntentId) {
            throw { status: 400, message: 'paymentIntentId is required' };
        }

        const _pendingNow = clock.now();
        const formatDate = _pendingNow.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Dubai",
        });

        const formatTime = _pendingNow.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Dubai",
        });

        const orderTime = `${formatDate}, ${formatTime}`;

        const pendingPayment = new PendingPayment({
            user_id: user_id,
            payment_id: paymentIntentId,
            payment_method: 'stripe',
            order_data: {
                cartData: cartDataToUse,
                shippingCost,
                name,
                phone,
                address,
                state,
                city,
                area,
                floorNo,
                buildingName,
                apartmentNo,
                landmark,
                currency,
                discountPercent,
                discountAmount,
                couponCode,
                mobileNumber,
                user_email,
                total,
                sub_total,
                txnId,
                paymentStatus,
                fcmToken
            },
            status: 'pending',
            orderfrom: 'Mobile App',
            orderTime: orderTime
        });

        await pendingPayment.save();
    }

    if (payment_method === 'tabby') {
        const data = await verifyTabbyPaymentInternal(paymentIntentId);
        if (data.status !== true) {
            throw { status: 400, message: `Payment verification failed. Status: ${data.finalStatus || data.status}` };
        }
    }

    const cartDataEntryValue = await CartData.create({ cartData: cartDataToUse });
    const cartDataValue = cartDataEntryValue.cartData;

    const formatter = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    let formattedshippingCost = 0;
    if(shippingCost) {
        formattedshippingCost = formatter.format(shippingCost);
    } else {
        formattedshippingCost = formatter.format(0);
    }

    const txn_id = txnId;
    const payment_status = paymentStatus;
    const stripe_checkout_session_id = paymentIntentId;
    const userEmail = user_email;
    const amount_subtotal = sub_total;
    const amount_total = total;

    const subtotalInDollars = amount_subtotal;
    const totalInDollars = amount_total;

    const db_subtotal_amount = subtotalInDollars.toFixed(2);
    const db_total_amount = totalInDollars.toFixed(2);

    const formatted_subtotal_amount = formatter.format(subtotalInDollars);
    const formatted_total_amount = formatter.format(totalInDollars);

    const discount_amount_long = Number(discountAmount);
    const discount_amount = formatter.format(discount_amount_long);

    const _orderNow = clock.now();
    const formatDate = _orderNow.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Dubai",
    });

    const formatTime = _orderNow.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Dubai",
    });

    const orderDateTime = `${formatDate} - ${formatTime}`;

    const lastOrder = await Order.findOne().sort({ order_no: -1 }).select("order_no");

    let nextOrderNo = 1;
    if(lastOrder && lastOrder.order_no) {
        nextOrderNo = lastOrder.order_no + 1;
    }

    const year = clock.now().getFullYear();
    const uniquePart = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 3);

    const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(
        3,
        "0"
    )}${uniquePart}`;

    const order = await Order.create({
        user_id,
        order_id: nextOrderId,
        order_no: nextOrderNo,
        order_datetime: orderDateTime,
        name,
        email: userEmail,
        address,
        state,
        city: city || '-',
        area: area || '-',
        floorNo: floorNo || '-',
        buildingName: buildingName || '-',
        apartmentNo: apartmentNo || '-',
        landmark: landmark != null ? String(landmark) : '-',
        amount_subtotal: db_subtotal_amount,
        amount_total: db_total_amount,
        discount_amount,
        phone,
        shipping: shippingCost,
        txn_id: txn_id,
        status: 'confirmed',
        payment_status: payment_status,
        stripe_checkout_session_id: stripe_checkout_session_id,
        payment_method: payment_method,
        orderfrom: 'Mobile App',
    });

    order.orderTracks.push({
        status: "Confirmed",
        dateTime: clock.now(),
        image: null,
    });

    await order.save();

    const user = await User.findById(user_id);
    await logActivity({
        platform: 'Mobile App Backend',
        log_type: 'backend_activity',
        action: 'Order Creation',
        status: 'success',
        message: `Order ${nextOrderId} created successfully`,
        user: user || { _id: user_id, name, email: userEmail },
        details: { order_id: nextOrderId }
    });

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Order Creation',
        status: 'success',
        message: `Order ${nextOrderId} created successfully`,
        order_id: nextOrderId,
        execution_path: 'orderController.checkoutSession -> Order.create'
    });

    if (couponCode && phone) {
        const coupon = await CouponMobile.findOneAndUpdate(
            {
                coupon: couponCode,
                phone: phone,
                status: "unused"
            },
            {
                status: "used"
            },
            {
                new: true
            }
        );

        if (coupon) {
            logger.info(`Coupon ${couponCode} status updated to 'used' after order creation.`);
        } else {
            logger.warn({ couponCode }, 'Coupon not found, already used, or does not match the mobile number.');
        }
    }

    await markCouponUsed(user, couponCode);
    if (couponCode === 'FIRST15' || couponCode === 'UAE10') {
        logger.info(`${couponCode} coupon marked as used for user: ${user_id} after order creation.`);
    }

    const orderDetails = cartDataValue.map((item) => {
        const isGift = !!item.isGiftWithPurchase;
        const amount = isGift ? 0 : (Number(item.price) || 0);
        return {
            order_id: order._id,
            product_id: item.id || item.product_id,
            productId: item.product_id || item.id,
            product_name: item.name,
            product_image: item.image,
            variant_name: item.variant,
            amount,
            quantity: item.qty,
            isGiftWithPurchase: isGift,
            nonReturnable: isGift,
        };
    });

    await OrderDetail.insertMany(orderDetails);

    await Promise.all([
        cache.delPattern('catalog:trending:*'),
        cache.del(cache.key('catalog', 'today-deal', 'v1')),
        cache.del(cache.key('catalog', 'favourites-of-week', 'v1')),
    ]).catch(err => logger.warn({ err }, 'cache invalidation failed after order insert'));

    logger.debug({ environment: ENVIRONMENT }, 'ENVIRONMENT');

    if (ENVIRONMENT === "true") {
        try {
            const results = await updateQuantities(cartDataToUse, nextOrderId);
            logger.info({ orderId: nextOrderId, results }, 'Inventory update results');
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'success',
                message: `Inventory updated for order ${nextOrderId}`,
                user: user || { _id: user_id, name, email: userEmail },
                details: { order_id: nextOrderId, results }
            });
        } catch (inventoryError) {
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'failure',
                message: `Inventory update failed for order ${nextOrderId}`,
                user: user || { _id: user_id, name, email: userEmail },
                details: {
                    order_id: nextOrderId,
                    error_details: inventoryError.message
                }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Inventory Update Batch',
                status: 'failure',
                message: `Inventory update batch failed for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.checkoutSession -> updateQuantities',
                error_details: inventoryError.message
            });
        }
    }

    const currentDate = clock.now();
    const deliveryDate = new Date(currentDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    const day = deliveryDate.getDate();
    const dayOfWeek = deliveryDate.toLocaleString('default', { weekday: 'long' });
    const month = deliveryDate.toLocaleString('default', { month: 'long' });
    const formattedDeliveryDate = `${dayOfWeek}, ${day} ${month}`;

    const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
    const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
    const adminEmail = process.env.ADMIN_EMAIL;
    const logoUrl = "https://www.bazaar-uae.com/logo.png";

    const purchaseDetails = cartDataValue.map(
        (data) => {
            const isGift = !!data.isGiftWithPurchase;
            const nameDisplay = isGift ? `${data.name} (Free Gift)` : data.name;
            const priceDisplay = isGift ? "0.00" : data.price;
            return `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${nameDisplay}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant || "-"}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${priceDisplay}</td>
                </tr>
                `;
        }
    )
    .join("");

    const html = buildAdminOrderEmailHtml({
        logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone
    });

    const html1 = buildUserOrderEmailHtml({
        logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone
    });

    try {
        await sendEmail(adminEmail, adminSubject, html);
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'success',
            message: `Admin email sent for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: { order_id: nextOrderId, recipient: adminEmail }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'success',
            message: `Admin email sent for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail'
        });
    } catch (adminEmailError) {
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'failure',
            message: `Failed to send admin email for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: {
                order_id: nextOrderId,
                recipient: adminEmail,
                error_details: adminEmailError.message
            }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'failure',
            message: `Failed to send admin email for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail',
            error_details: adminEmailError.message
        });
    }

    try {
        await sendEmail(userEmail, userSubject, html1);
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'success',
            message: `User email sent for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: { order_id: nextOrderId, recipient: userEmail }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'success',
            message: `User email sent for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail'
        });
    } catch (userEmailError) {
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'failure',
            message: `Failed to send user email for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: {
                order_id: nextOrderId,
                recipient: userEmail,
                error_details: userEmailError.message
            }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'failure',
            message: `Failed to send user email for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail',
            error_details: userEmailError.message
        });
    }

    await Cart.findOneAndDelete({ user: user_id });

    return {
        message: "Order created successfully",
        orderId: order._id,
    };
};
