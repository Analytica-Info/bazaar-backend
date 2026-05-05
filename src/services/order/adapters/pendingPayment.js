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
const { sendPushNotification } = require('../../../helpers/sendPushNotification');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');
const cache = require('../../../utilities/cache');
const { updateQuantities } = require('../shared/quantities');
const { buildWebhookAdminEmailHtml, buildWebhookUserEmailHtml } = require('../domain/emailTemplates');
const markCouponUsed = require('../use-cases/markCouponUsed');
const { MS_PER_DAY } = require('../../../config/constants/time');
const runtimeConfig = require('../../../config/runtime');

const DELIVERY_DAYS = runtimeConfig.order.deliveryDays;

const ENVIRONMENT = process.env.ENVIRONMENT;

async function processPendingPayment(paymentId, payment) {
    try {
        logger.debug({ paymentId }, "📋 [Pending Payment] Processing pending payment");

        const pendingPayment = await PendingPayment.findOne({
            payment_id: paymentId,
            status: 'pending'
        });

        if (!pendingPayment) {
            logger.debug({ paymentId }, "⚠️ [Pending Payment] No pending payment found");
            return;
        }

        pendingPayment.status = 'processing';
        pendingPayment.webhook_received = true;
        pendingPayment.webhook_status = 'CLOSED';
        await pendingPayment.save();

        const orderData = pendingPayment.order_data;
        const user_id = pendingPayment.user_id;

        logger.debug({ user_id }, "📋 [Pending Payment] Creating order for user");

        const cartDataEntryValue = await CartData.create({ cartData: orderData.cartData });
        const cartDataValue = cartDataEntryValue.cartData;

        const formatter = new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        let formattedshippingCost = 0;
        if(orderData.shippingCost) {
            formattedshippingCost = formatter.format(orderData.shippingCost);
        } else {
            formattedshippingCost = formatter.format(0);
        }

        const amount_subtotal = orderData.sub_total;
        const amount_total = orderData.total;
        const discountAmount = orderData.discountAmount;

        const db_subtotal_amount = amount_subtotal.toFixed(2);
        const db_total_amount = amount_total.toFixed(2);

        const formatted_subtotal_amount = formatter.format(amount_subtotal);
        const formatted_total_amount = formatter.format(amount_total);

        const discount_amount_long = Number(discountAmount);
        const discount_amount = formatter.format(discount_amount_long);

        const now = clock.now();
        const formatDate = now.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Dubai",
        });

        const formatTime = now.toLocaleTimeString("en-GB", {
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
        const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(3, "0")}${uniquePart}`;

        const order = await Order.create({
            user_id,
            order_id: nextOrderId,
            order_no: nextOrderNo,
            order_datetime: orderDateTime,
            name: orderData.name,
            email: orderData.user_email,
            address: orderData.address,
            state: orderData.state,
            city: orderData.city || '-',
            area: orderData.area || '-',
            floorNo: orderData.floorNo || '-',
            buildingName: orderData.buildingName || '-',
            apartmentNo: orderData.apartmentNo || '-',
            landmark: orderData.landmark != null ? String(orderData.landmark) : '-',
            amount_subtotal: db_subtotal_amount,
            amount_total: db_total_amount,
            discount_amount,
            phone: orderData.phone,
            shipping: orderData.shippingCost,
            txn_id: paymentId,
            status: 'confirmed',
            payment_status: 'paid',
            stripe_checkout_session_id: paymentId,
            payment_method: 'tabby',
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
            message: `Order ${nextOrderId} created successfully via webhook`,
            user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
            details: { order_id: nextOrderId, payment_id: paymentId }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Order Creation',
            status: 'success',
            message: `Order ${nextOrderId} created successfully via webhook`,
            order_id: nextOrderId,
            execution_path: 'orderController.processPendingPayment -> Order.create'
        });

        if (orderData.couponCode && orderData.mobileNumber) {
            const coupon = await CouponMobile.findOneAndUpdate(
                {
                    coupon: orderData.couponCode,
                    phone: orderData.mobileNumber,
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
                logger.info(`Coupon ${orderData.couponCode} status updated to 'used' after order creation.`);
            } else {
                logger.warn({ couponCode: orderData.couponCode }, 'Coupon not found, already used, or does not match the mobile number.');
            }
        }

        await markCouponUsed(user, orderData.couponCode);
        if (orderData.couponCode === 'FIRST15' || orderData.couponCode === 'UAE10') {
            logger.info(`${orderData.couponCode} coupon marked as used for user: ${user_id} after order creation.`);
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

        if (ENVIRONMENT === "true") {
            try {
                const results = await updateQuantities(orderData.cartData, nextOrderId);
                logger.info({ orderId: nextOrderId, results }, 'Inventory update results');
                await logActivity({
                    platform: 'Mobile App Backend',
                    log_type: 'backend_activity',
                    action: 'Inventory Update',
                    status: 'success',
                    message: `Inventory updated for order ${nextOrderId}`,
                    user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                    details: { order_id: nextOrderId, results }
                });
            } catch (inventoryError) {
                await logActivity({
                    platform: 'Mobile App Backend',
                    log_type: 'backend_activity',
                    action: 'Inventory Update',
                    status: 'failure',
                    message: `Inventory update failed for order ${nextOrderId}`,
                    user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
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
                    execution_path: 'orderController.processPendingPayment -> updateQuantities',
                    error_details: inventoryError.message
                });
            }
        }

        const currentDate = clock.now();
        const deliveryDate = new Date(currentDate.getTime() + DELIVERY_DAYS * MS_PER_DAY);
        const day = deliveryDate.getDate();
        const month = deliveryDate.toLocaleString('default', { month: 'long' });
        const deliveryYear = deliveryDate.getFullYear();
        const formattedDeliveryDate = `${day} ${month} ${deliveryYear}`;

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
        ).join("");

        const html = buildWebhookAdminEmailHtml({
            logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
            formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
            orderData
        });

        const html1 = buildWebhookUserEmailHtml({
            logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
            formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
            orderData
        });

        logger.info("📧 ================================================");
        logger.info("📧 ========== SENDING EMAIL NOTIFICATIONS ==========");
        logger.info("📧 ================================================");
        logger.info(`📧 Admin Email: ${adminEmail}`);
        logger.info(`📧 User Email: ${orderData.user_email}`);
        logger.info(`📧 Order ID: ${nextOrderId}`);
        logger.info("📧 ================================================");

        try {
            await sendEmail(adminEmail, adminSubject, html);
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'success',
                message: `Admin email sent for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                details: { order_id: nextOrderId, recipient: adminEmail }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Email Sending',
                status: 'success',
                message: `Admin email sent for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.processPendingPayment -> sendEmail'
            });
        } catch (adminEmailError) {
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'failure',
                message: `Failed to send admin email for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
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
                execution_path: 'orderController.processPendingPayment -> sendEmail',
                error_details: adminEmailError.message
            });
        }

        try {
            await sendEmail(orderData.user_email, userSubject, html1);
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'success',
                message: `User email sent for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                details: { order_id: nextOrderId, recipient: orderData.user_email }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Email Sending',
                status: 'success',
                message: `User email sent for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.processPendingPayment -> sendEmail'
            });
        } catch (userEmailError) {
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'failure',
                message: `Failed to send user email for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                details: {
                    order_id: nextOrderId,
                    recipient: orderData.user_email,
                    error_details: userEmailError.message
                }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Email Sending',
                status: 'failure',
                message: `Failed to send user email for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.processPendingPayment -> sendEmail',
                error_details: userEmailError.message
            });
        }

        logger.info("✅ ================================================");
        logger.info("✅ ========== EMAILS SENT SUCCESSFULLY ==========");
        logger.info("✅ ================================================");

        await Cart.findOneAndDelete({ user: user_id });

        logger.info("🔔 ================================================");
        logger.info("🔔 ========== SENDING PUSH NOTIFICATION ==========");
        logger.info("🔔 ================================================");

        if (user && user.fcmToken) {
            logger.info(`🔔 User FCM Token: ${user.fcmToken.substring(0, 20)}...`);
            logger.info(`🔔 Order ID: ${nextOrderId}`);
            logger.info(`🔔 User: ${orderData.name}`);

            // await sendPushNotification(
            //     user.fcmToken,
            //     `Order No: ${nextOrderId} Placed Successfully`,
            //     `Hi ${orderData.name}, your order of AED ${amount_total} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
            //     user_id,
            //     order._id
            // );

            logger.info("✅ ================================================");
            logger.info("✅ ========== PUSH NOTIFICATION SENT ==========");
            logger.info("✅ ================================================");
        } else {
            logger.info("⚠️ No FCM token found for user");
        }

        pendingPayment.status = 'completed';
        await pendingPayment.save();

        logger.info({ orderId: order._id }, "✅ [Pending Payment] Order created successfully");

    } catch (error) {
        logger.error({ err: error }, "❌ [Pending Payment] Error processing pending payment:");

        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Order Processing',
            status: 'failure',
            message: `Failed to process pending payment: ${error.message}`,
            user: { _id: null },
            details: {
                payment_id: paymentId,
                error_details: error.message,
                stack: error.stack
            }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Order Processing',
            status: 'failure',
            message: `Failed to process pending payment: ${error.message}`,
            execution_path: 'orderController.processPendingPayment',
            error_details: error.message
        });

        const pendingPaymentRecord = await PendingPayment.findOne({ payment_id: paymentId });
        if (pendingPaymentRecord) {
            pendingPaymentRecord.status = 'failed';
            await pendingPaymentRecord.save();
        }
    }
}

module.exports = { processPendingPayment };
