'use strict';

/**
 * use-cases/sendOrderConfirmationEmails.js
 *
 * Payment-method-agnostic order confirmation email sender.
 * Called by handleTabbyWebhook, verifyNomodPayment, and verifyStripePayment
 * after an order has been persisted.
 *
 * Does NOT create orders, update inventory, or touch the DB —
 * those concerns stay in each webhook/verify use-case.
 */

const { sendEmail } = require('../../../mail/emailService');
const { getAdminEmail, getCcEmails } = require('../../../utilities/emailHelper');
const { logActivity } = require('../../../utilities/activityLogger');
const logger = require('../../../utilities/logger');

const { buildTabbyAdminOrderHtml, buildTabbyUserOrderHtml } = require('../templates/tabbyOrderHtml');
const clock = require('../../../utilities/clock');
const { MS_PER_DAY } = require('../../../config/constants/time');
const runtimeConfig = require('../../../config/runtime');

const DELIVERY_DAYS = runtimeConfig.order.deliveryDays;
const WEBURL = process.env.URL;

/**
 * Send admin + customer confirmation emails for a completed order.
 *
 * @param {object} opts
 * @param {object}   opts.order           - persisted Mongoose Order document
 * @param {object}   [opts.user]          - Mongoose User document (may be null for guests)
 * @param {Array}    opts.cartItems        - line-item array ({ name, variant, qty, price })
 * @param {object}   opts.totals
 * @param {number|string} opts.totals.subtotal
 * @param {number|string} opts.totals.shipping
 * @param {number|string} opts.totals.discount
 * @param {number|string} opts.totals.total
 * @param {string}   [opts.totals.currency]
 * @param {string}   opts.paymentMethod   - 'tabby' | 'stripe' | 'nomod'
 * @param {string}   [opts.paymentRef]    - payment provider transaction id
 * @returns {Promise<void>}
 */
async function sendOrderConfirmationEmails({ order, user, cartItems, totals, paymentMethod, paymentRef }) {
  const formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formattedshippingCost = formatter.format(Number(totals.shipping) || 0);
  const formatted_subtotal_amount = formatter.format(Number(totals.subtotal) || 0);
  const discountAmount = Number(totals.discount) || 0;
  const formattedDiscountAmount = formatter.format(discountAmount);
  const formatted_total_amount = formatter.format(Number(totals.total) || 0);

  const currentDate = clock.now();
  const deliveryDate = new Date(currentDate.getTime() + DELIVERY_DAYS * MS_PER_DAY);
  const dayNum = deliveryDate.getDate();
  const dayOfWeek = deliveryDate.toLocaleString('default', { weekday: 'long' });
  const monthStr = deliveryDate.toLocaleString('default', { month: 'long' });
  const formattedDeliveryDate = `${dayOfWeek}, ${dayNum} ${monthStr}`;

  const nextOrderId = order.order_id;
  const orderDateTime = order.order_datetime;
  const name = order.name;
  const userEmail = order.email;
  const phone = order.phone;
  const city = order.city;
  const area = order.area;
  const buildingName = order.buildingName;
  const floorNo = order.floorNo;
  const apartmentNo = order.apartmentNo;
  const landmark = order.landmark;

  function toCapitalCase(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  const formattedPaymentMethod = toCapitalCase(paymentMethod);

  const logoUrl = `${WEBURL}/images/logo.png`;

  const purchaseDetails = cartItems.map(
    (data) => `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.name}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant || '-'}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${data.price}</td>
                </tr>
                `
  ).join('');

  const emailTemplateParams = {
    logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
    formattedshippingCost, formatted_subtotal_amount,
    discountAmount, formattedDiscountAmount, formatted_total_amount,
    formattedPaymentMethod,
    name, userEmail, city, area, buildingName, floorNo, apartmentNo, landmark, phone,
  };

  const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
  const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
  const adminEmail = await getAdminEmail();
  const ccEmails = await getCcEmails();

  const adminHtml = buildTabbyAdminOrderHtml(emailTemplateParams);
  const userHtml = buildTabbyUserOrderHtml(emailTemplateParams);

  const logUser = user || { userId: order.userId, name, email: userEmail };

  try {
    await sendEmail(adminEmail, adminSubject, adminHtml, ccEmails);
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'success',
      message: `Admin email sent for order ${nextOrderId}`,
      user: logUser,
      details: { order_id: nextOrderId, recipient: adminEmail }
    });
  } catch (adminEmailError) {
    logger.error({ err: adminEmailError }, `Failed to send admin email for order ${nextOrderId}`);
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'failure',
      message: `Failed to send admin email for order ${nextOrderId}`,
      user: logUser,
      details: { order_id: nextOrderId, recipient: adminEmail, error_details: adminEmailError.message }
    });
  }

  try {
    await sendEmail(userEmail, userSubject, userHtml);
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'success',
      message: `User email sent for order ${nextOrderId}`,
      user: logUser,
      details: { order_id: nextOrderId, recipient: userEmail }
    });
  } catch (userEmailError) {
    logger.error({ err: userEmailError }, `Failed to send user email for order ${nextOrderId}`);
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'failure',
      message: `Failed to send user email for order ${nextOrderId}`,
      user: logUser,
      details: { order_id: nextOrderId, recipient: userEmail, error_details: userEmailError.message }
    });
  }
}

module.exports = sendOrderConfirmationEmails;
