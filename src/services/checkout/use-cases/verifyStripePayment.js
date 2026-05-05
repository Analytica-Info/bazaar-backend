'use strict';

/**
 * use-cases/verifyStripePayment.js
 *
 * Verify a Stripe checkout session and create the order.
 * Extracted from checkoutService (PR-MOD-4).
 *
 * BUG-010: stripe + ENVIRONMENT + year consts captured at module load time.
 */

const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SK);

// BUG-010: module-load consts
const ENVIRONMENT = process.env.ENVIRONMENT;
const WEBURL = process.env.URL;

const repositories = require('../../../repositories');
const Order = repositories.orders.rawModel();
const OrderDetail = repositories.orderDetails.rawModel();
const CartData = repositories.cartData.rawModel();
const User = repositories.users.rawModel();
const Coupon = repositories.coupons.rawModel();
const BankPromoCode = repositories.bankPromoCodes.rawModel();
const BankPromoCodeUsage = repositories.bankPromoCodeUsages.rawModel();
const Notification = repositories.notifications.rawModel();
const PendingPayment = repositories.pendingPayments.rawModel();

const { sendEmail } = require('../../../mail/emailService');
const { getAdminEmail, getCcEmails } = require('../../../utilities/emailHelper');
const { logActivity } = require('../../../utilities/activityLogger');
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');

const { clearUserCart, getUaeDateTime } = require('../domain/cartHelpers');
const { updateQuantities } = require('../shared/inventory');
const { buildStripeAdminOrderHtml, buildStripeUserOrderHtml } = require('../templates/stripeOrderHtml');
const clock = require('../../../utilities/clock');
const { MS_PER_DAY } = require('../../../config/constants/time');
const runtimeConfig = require('../../../config/runtime');

const DELIVERY_DAYS = runtimeConfig.order.deliveryDays;

/**
 * @param {string} sessionId
 * @param {string} userId
 * @returns {Promise<{ message: string, orderId: string }>}
 */
async function verifyStripePayment(sessionId, userId) {
  try {
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Verify Card Payment API Hit',
      status: 'success',
      message: `verifyCardPayment API hit - user: ${userId || 'n/a'}, sessionId: ${sessionId || 'n/a'}`,
      execution_path: 'checkoutService.verifyStripePayment (initial)'
    });

    if (!sessionId) {
      throw { status: 400, message: 'Session ID is required' };
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata || {};
    const {
      shippingCost, name, phone, address, currency, totalAmount,
      subTotalAmount, city, area, buildingName, floorNo, apartmentNo,
      landmark, couponCode, mobileNumber, paymentMethod, discountAmount,
      saved_total, bankPromoId,
    } = metadata || {};

    const state = metadata?.state || '-';

    const cartDataId = metadata.cartDataId;
    const cartDataEntry = await CartData.findById(cartDataId);
    const cartData = cartDataEntry.cartData;

    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

    let formattedshippingCost = 0;
    if (shippingCost) {
      formattedshippingCost = formatter.format(shippingCost);
    } else {
      formattedshippingCost = formatter.format(0);
    }

    if (session.payment_status === 'paid') {
      if (couponCode && mobileNumber) {
        const coupon = await Coupon.findOne({ coupon: couponCode, phone: mobileNumber });
        if (coupon) {
          coupon.status = 'used';
          await coupon.save();
          logger.info(`Coupon ${couponCode} status updated to 'used'.`);
        } else {
          logger.info(`Coupon ${couponCode} not found or does not match the mobile number.`);
        }
      }

      if (bankPromoId && userId) {
        try {
          const promo = await BankPromoCode.findById(bankPromoId);
          if (promo) {
            const existing = await BankPromoCodeUsage.findOne({ bankPromoCodeId: promo._id, userId: userId });
            if (!existing) {
              await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId: userId });
              promo.usageCount = (promo.usageCount || 0) + 1;
              await promo.save();
              logger.info(`Bank promo ${promo.code} usage recorded for user ${userId}.`);
            }
          }
        } catch (err) {
          logger.error({ err: err }, 'Error recording bank promo usage:');
        }
      }

      const txn_id = session.payment_intent;
      const payment_status = session.payment_status;
      const stripe_checkout_session_id = session.id;
      const userEmail = session.customer_details.email;

      const formatDate = clock.now().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai',
      });
      const formatTime = clock.now().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai',
      });
      const orderDateTime = `${formatDate} - ${formatTime}`;

      const paymentId = session.id || session.payment_intent;
      const methodForDb = (paymentMethod && paymentMethod.toLowerCase() === 'tabby') ? 'tabby' : 'stripe';
      const pendingPayment = new PendingPayment({
        user_id: userId, payment_id: paymentId, payment_method: methodForDb,
        order_data: {
          cartData, shippingCost, name, phone, address, state: state || '-',
          city, area, floorNo, buildingName, apartmentNo, landmark, currency,
          discountPercent: metadata?.discountPercent ?? null, discountAmount,
          couponCode, mobileNumber,
          user_email: session.customer_details?.email ?? userEmail,
          total: totalAmount, sub_total: subTotalAmount,
          txnId: session.payment_intent, paymentStatus: session.payment_status,
          fcmToken: null, saved_total: saved_total ?? null
        },
        status: 'completed', orderfrom: 'Website', orderTime: orderDateTime
      });
      await pendingPayment.save();

      const lastOrder = await Order.findOne().sort({ createdAt: -1 }).select('order_no');
      let nextOrderNo = 1;
      if (lastOrder && lastOrder.order_no) { nextOrderNo = lastOrder.order_no + 1; }

      const uniquePart = crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
      const year = clock.now().getFullYear();
      const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(3, '0')}${uniquePart}`;

      const orderPayload = {
        userId: userId, order_id: nextOrderId, order_no: nextOrderNo,
        order_datetime: orderDateTime, name, email: userEmail, address,
        state: '-', city: city || '-', area: area || '-',
        buildingName: buildingName || '-', floorNo: floorNo || '-',
        apartmentNo: apartmentNo || '-', landmark: landmark || '-',
        amount_subtotal: subTotalAmount, amount_total: totalAmount,
        discount_amount: discountAmount, phone, status: 'confirmed',
        shipping: shippingCost, txn_id, payment_status,
        checkout_session_id: stripe_checkout_session_id,
        payment_method: paymentMethod, saved_total: saved_total || 0,
        orderfrom: 'Website',
      };
      const order = await Order.create(orderPayload);

      const user = await User.findById(userId);
      await logActivity({
        platform: 'Website Backend', log_type: 'backend_activity', action: 'Order Creation',
        status: 'success', message: `Order ${nextOrderId} created successfully`,
        user: user || { userId, name, email: userEmail },
        details: { order_id: nextOrderId }
      });

      await logBackendActivity({
        platform: 'Website Backend', activity_name: 'Order Creation', status: 'success',
        message: `Order ${nextOrderId} created successfully`,
        order_id: nextOrderId,
        execution_path: 'checkoutService.verifyStripePayment -> Order.create'
      });

      const orderDetails = cartData.map((item) => ({
        order_id: order._id, product_id: item.id, productId: item.product_id,
        product_name: item.name, product_image: item.image,
        variant_name: item.variant, amount: item.price, quantity: item.qty,
      }));
      await OrderDetail.insertMany(orderDetails);

      if (ENVIRONMENT === 'true') {
        try {
          const results = await updateQuantities(cartData, nextOrderId);
          console.log('Update results:', results);
          await logActivity({
            platform: 'Website Backend', log_type: 'backend_activity', action: 'Inventory Update',
            status: 'success', message: `Inventory updated for order ${nextOrderId}`,
            user: user || { userId, name, email: userEmail },
            details: { order_id: nextOrderId, results }
          });
        } catch (inventoryError) {
          await logActivity({
            platform: 'Website Backend', log_type: 'backend_activity', action: 'Inventory Update',
            status: 'failure', message: `Inventory update failed for order ${nextOrderId}`,
            user: user || { userId, name, email: userEmail },
            details: { order_id: nextOrderId, error_details: inventoryError.message }
          });
          await logBackendActivity({
            platform: 'Website Backend', activity_name: 'Inventory Update Batch', status: 'failure',
            message: `Inventory update batch failed for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'checkoutService.verifyStripePayment -> updateQuantities',
            error_details: inventoryError.message
          });
        }
      }

      const currentDate = clock.now();
      const deliveryDate = new Date(currentDate.getTime() + DELIVERY_DAYS * MS_PER_DAY);
      const dayNum = deliveryDate.getDate();
      const dayOfWeek = deliveryDate.toLocaleString('default', { weekday: 'long' });
      const monthStr = deliveryDate.toLocaleString('default', { month: 'long' });
      const formattedDeliveryDate = `${dayOfWeek}, ${dayNum} ${monthStr}`;

      const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
      const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
      const adminEmailAddr = await getAdminEmail();
      const logoUrl = `${WEBURL}/images/logo.png`;

      function toCapitalCase(str) { if (!str) return ''; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); }
      const formattedPaymentMethod = toCapitalCase(paymentMethod);

      const ccEmails = await getCcEmails();

      const purchaseDetails = cartData.map((data) => `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.name}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${data.price}</td>
                </tr>`).join('');

      const stripeEmailParams = {
        logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        subTotalAmount, formattedshippingCost, discountAmount, totalAmount, formattedPaymentMethod,
        name, userEmail, city, area, buildingName, floorNo, apartmentNo, landmark, phone,
      };

      const adminHtml = buildStripeAdminOrderHtml(stripeEmailParams);
      const userHtml = buildStripeUserOrderHtml(stripeEmailParams);

      // Send emails
      try {
        await sendEmail(adminEmailAddr, adminSubject, adminHtml, ccEmails);
      } catch (adminEmailError) {
        logger.error({ err: adminEmailError }, 'Failed to send admin email:');
      }

      try {
        await sendEmail(userEmail, userSubject, userHtml);
      } catch (userEmailError) {
        logger.error({ err: userEmailError }, 'Failed to send user email:');
      }

      await Notification.create({
        userId: userId,
        title: `Order No: ${order.order_id} Placed Successfully`,
        message: `Hi ${name}, your order of AED ${Number(totalAmount).toFixed(2)} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
      });

      await clearUserCart(userId);

      order.orderTracks.push({ status: 'Confirmed', dateTime: getUaeDateTime(), image: null });
      await order.save();

      return { message: 'Order created successfully', orderId: order._id };
    } else {
      throw { status: 400, message: 'Payment not successful.' };
    }
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    await logBackendActivity({
      platform: 'Website Backend', activity_name: 'Verify Card Payment API Hit',
      status: 'failure', message: `verifyCardPayment failed: ${error.message}`,
      execution_path: 'checkoutService.verifyStripePayment (catch)',
      error_details: error.message
    });
    throw { status: 500, message: error.message };
  }
}

module.exports = verifyStripePayment;
