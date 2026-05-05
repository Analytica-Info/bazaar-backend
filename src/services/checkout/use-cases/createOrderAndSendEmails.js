'use strict';

/**
 * use-cases/createOrderAndSendEmails.js
 *
 * Shared by Tabby success paths (verifyTabbyPayment + handleTabbyWebhook).
 * Extracted from checkoutService (PR-MOD-4).
 *
 * BUG-010: ENVIRONMENT const captured at module load (not call-time).
 */

const crypto = require('crypto');

const repositories = require('../../../repositories');
const Order = repositories.orders.rawModel();
const OrderDetail = repositories.orderDetails.rawModel();
const CartData = repositories.cartData.rawModel();
const User = repositories.users.rawModel();
const Coupon = repositories.coupons.rawModel();

const { sendEmail } = require('../../../mail/emailService');
const { getAdminEmail, getCcEmails } = require('../../../utilities/emailHelper');
const { logActivity } = require('../../../utilities/activityLogger');
const logger = require('../../../utilities/logger');

const { clearUserCart, getUaeDateTime } = require('../domain/cartHelpers');
const { updateQuantities } = require('../shared/inventory');
const { buildTabbyAdminOrderHtml, buildTabbyUserOrderHtml } = require('../templates/tabbyOrderHtml');
const clock = require('../../../utilities/clock');
const { MS_PER_DAY } = require('../../../config/constants/time');
const runtimeConfig = require('../../../config/runtime');

const DELIVERY_DAYS = runtimeConfig.order.deliveryDays;

// BUG-010: module-load const — do NOT move into the function body
const ENVIRONMENT = process.env.ENVIRONMENT;
const WEBURL = process.env.URL;

/**
 * Create an order from a completed Tabby payment and send confirmation emails.
 * Idempotent: returns existing order if txn_id already processed.
 *
 * @param {object} payment - Tabby payment object (status CLOSED)
 * @param {string} user_id
 * @returns {Promise<object>} Mongoose Order document
 */
async function createOrderAndSendEmails(payment, user_id) {
  // 1. Idempotency: Check if order already exists
  let order = await Order.findOne({ txn_id: payment.id });
  if (order) {
    return order; // Already processed
  }

  // 2. Extract cart and user info from payment metadata
  const {
    cartDataId,
    city,
    area,
    buildingName,
    floorNo,
    apartmentNo,
    landmark,
    couponCode,
    mobileNumber,
    paymentMethod,
    discountPercent,
  } = payment.meta || {};

  if (!cartDataId) throw new Error('Missing cartDataId in payment metadata');

  const cartDataEntry = await CartData.findById(cartDataId);
  if (!cartDataEntry) {
    throw new Error('Cart data not found');
  }
  const cartData = cartDataEntry.cartData;

  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const shippingCost = payment.order.shipping_amount || 0;

  let formattedshippingCost = 0;
  if (shippingCost) {
    formattedshippingCost = formatter.format(shippingCost);
  } else {
    formattedshippingCost = formatter.format(0);
  }

  const amount_subtotal = payment.meta.subtotalAmount;
  const formatted_subtotal_amount = formatter.format(amount_subtotal);

  const amount_total = payment.amount;
  const formatted_total_amount = formatter.format(amount_total);

  const discountAmount = payment.order.discount_amount || 0;
  const formattedDiscountAmount = formatter.format(discountAmount);

  if (couponCode && mobileNumber) {
    const coupon = await Coupon.findOne({
      coupon: couponCode,
      phone: mobileNumber,
    });
    if (coupon && coupon.status !== 'used') {
      coupon.status = 'used';
      await coupon.save();
      logger.info(`Coupon ${couponCode} status updated to 'used'.`);
    }
  }

  const formatDate = clock.now().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
  const formatTime = clock.now().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dubai',
  });
  const orderDateTime = `${formatDate} - ${formatTime}`;

  const lastOrder = await Order.findOne()
    .sort({ createdAt: -1 })
    .select('order_no');
  let nextOrderNo = 1;
  if (lastOrder && lastOrder.order_no) {
    nextOrderNo = lastOrder.order_no + 1;
  }
  const uniquePart = crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()
    .slice(0, 3);

  const year = clock.now().getFullYear();
  const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(3, '0')}${uniquePart}`;

  // 3. Prepare order details
  const orderData = {
    userId: user_id,
    order_id: nextOrderId,
    order_no: nextOrderNo,
    order_datetime: orderDateTime,
    name: payment.buyer.name,
    email: payment.buyer.email,
    address: payment.shipping_address.address,
    state: '-',
    city: city || '-',
    area: area || '-',
    buildingName: buildingName || '-',
    floorNo: floorNo || '-',
    apartmentNo: apartmentNo || '-',
    landmark: landmark || '-',
    amount_subtotal: formatted_subtotal_amount,
    amount_total: formatted_total_amount,
    discount_amount: formattedDiscountAmount,
    phone: payment.buyer.phone,
    shipping: formattedshippingCost,
    txn_id: payment.id,
    status: 'confirmed',
    payment_method: paymentMethod,
    payment_status: 'paid',
    checkout_session_id: payment.id,
    saved_total: payment.meta.saved_total || 0,
    orderfrom: 'Website',
  };

  // 4. Create order in DB
  order = await Order.create(orderData);

  // Log order creation
  const user = await User.findById(user_id);
  await logActivity({
    platform: 'Website Backend',
    log_type: 'backend_activity',
    action: 'Order Creation',
    status: 'success',
    message: `Order ${nextOrderId} created successfully via Tabby`,
    user: user || { userId: user_id, name: payment.buyer.name, email: payment.buyer.email },
    details: { order_id: nextOrderId, payment_id: payment.id }
  });

  // 5. Create order details (line items)
  const orderDetails = cartData.map((item) => ({
    order_id: order._id,
    product_id: item.id,
    productId: item.product_id,
    product_name: item.name,
    product_image: item.image,
    variant_name: item.variant,
    amount: item.price,
    quantity: item.qty,
  }));
  await OrderDetail.insertMany(orderDetails);

  if (ENVIRONMENT === 'true') {
    try {
      const results = await updateQuantities(cartData);
      console.log('Update results:', results);
      await logActivity({
        platform: 'Website Backend',
        log_type: 'backend_activity',
        action: 'Inventory Update',
        status: 'success',
        message: `Inventory updated for order ${nextOrderId}`,
        user: user || { userId: user_id, name: payment.buyer.name, email: payment.buyer.email },
        details: { order_id: nextOrderId, results }
      });
    } catch (inventoryError) {
      await logActivity({
        platform: 'Website Backend',
        log_type: 'backend_activity',
        action: 'Inventory Update',
        status: 'failure',
        message: `Inventory update failed for order ${nextOrderId}`,
        user: user || { userId: user_id, name: payment.buyer.name, email: payment.buyer.email },
        details: {
          order_id: nextOrderId,
          error_details: inventoryError.message
        }
      });
    }
  }

  const currentDate = clock.now();
  const deliveryDate = new Date(
    currentDate.getTime() + DELIVERY_DAYS * MS_PER_DAY
  );
  const dayNum = deliveryDate.getDate();
  const dayOfWeek = deliveryDate.toLocaleString('default', {
    weekday: 'long',
  });
  const monthStr = deliveryDate.toLocaleString('default', { month: 'long' });
  const formattedDeliveryDate = `${dayOfWeek}, ${dayNum} ${monthStr}`;

  const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
  const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
  const adminEmail = await getAdminEmail();

  const logoUrl = `${WEBURL}/images/logo.png`;

  const ccEmails = await getCcEmails();

  const name = payment.buyer.name;
  const userEmail = payment.buyer.email;
  const phone = payment.buyer.phone;

  function toCapitalCase(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const formattedPaymentMethod = toCapitalCase(paymentMethod);

  const purchaseDetails = cartData
    .map(
      (data) => `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.name}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${data.price}</td>
                </tr>
                `
    )
    .join('');

  const emailTemplateParams = {
    logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
    formattedshippingCost, formatted_subtotal_amount,
    discountAmount, formattedDiscountAmount, formatted_total_amount,
    formattedPaymentMethod,
    name, userEmail, city, area, buildingName, floorNo, apartmentNo, landmark, phone,
  };

  const html = buildTabbyAdminOrderHtml(emailTemplateParams);
  const html1 = buildTabbyUserOrderHtml(emailTemplateParams);

  // Send emails and log
  try {
    await sendEmail(adminEmail, adminSubject, html, ccEmails);
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'success',
      message: `Admin email sent for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { order_id: nextOrderId, recipient: adminEmail }
    });
  } catch (adminEmailError) {
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'failure',
      message: `Failed to send admin email for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { order_id: nextOrderId, recipient: adminEmail, error_details: adminEmailError.message }
    });
  }

  try {
    await sendEmail(userEmail, userSubject, html1);
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'success',
      message: `User email sent for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { order_id: nextOrderId, recipient: userEmail }
    });
  } catch (userEmailError) {
    await logActivity({
      platform: 'Website Backend', log_type: 'backend_activity', action: 'Email Sending', status: 'failure',
      message: `Failed to send user email for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { order_id: nextOrderId, recipient: userEmail, error_details: userEmailError.message }
    });
  }

  await clearUserCart(user_id);

  order.orderTracks.push({
    status: 'Confirmed',
    dateTime: getUaeDateTime(),
    image: null,
  });

  await order.save();

  return order;
}

module.exports = createOrderAndSendEmails;
