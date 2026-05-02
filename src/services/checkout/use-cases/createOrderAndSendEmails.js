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

// BUG-010: module-load const — do NOT move into the function body
const ENVIRONMENT = process.env.ENVIRONMENT;
const WEBURL = process.env.URL;
const year = new Date().getFullYear();

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

  const formatDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
  const formatTime = new Date().toLocaleTimeString('en-GB', {
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

  const currentDate = new Date();
  const deliveryDate = new Date(
    currentDate.getTime() + 3 * 24 * 60 * 60 * 1000
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
  const html = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr><td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="text-align:center;"><a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: bold; margin-top: 10px; margin-bottom: 6px;"><b>Payment Method:</b> ${formattedPaymentMethod}</p>
                                    </td></tr>
                                    <tr><td style="height:30px;">&nbsp;</td></tr>
                                    <tr><td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>A new order has been placed on Bazaar.</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Below are the order details:</p>
                                    </td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;"><tr style="background-color: #f8f9fa; text-align: center;"><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th></tr></thead>
                                                <tbody style="font-size: 14px;">${purchaseDetails}</tbody>
                                                <thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th></tr></thead>
                                                <thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th></tr></thead>
                                                ${discountAmount > 0 ? `<thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${formattedDiscountAmount}</b></th></tr></thead>` : ''}
                                                <thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_total_amount}</b></th></tr></thead>
                                            </table>
                                    </td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td><p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600;">Customer Information</p><br /></td></tr>
                                    <tr><td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Landmark: ${landmark || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Phone: ${phone}</p>
                                    </td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74); line-height:18px; margin:0;">&copy; <strong>bazaar-uae.com</strong></p></td></tr>
                                    <tr><td style="height:80px;">&nbsp;</td></tr>
                                </table>
                        </td></tr>
                    </table>
                </body>`;

  const html1 = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr><td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="text-align:center;"><a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>Get it By:</b> ${formattedDeliveryDate}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: bold; margin-top: 10px; margin-bottom: 6px;"><b>Payment Method:</b> ${formattedPaymentMethod}</p>
                                    </td></tr>
                                    <tr><td style="height:30px;">&nbsp;</td></tr>
                                    <tr><td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600;"><b>${name}</b>! Thank you for your order with Bazaar!</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600;">We have received your order and are processing it. Below are the details of your purchase</p>
                                    </td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead><tr style="background-color: #f8f9fa;"><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th></tr></thead>
                                                <tbody style="font-size: 14px;">${purchaseDetails}</tbody>
                                                <thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th></tr></thead>
                                                <thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th></tr></thead>
                                                ${discountAmount > 0 ? `<thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${formattedDiscountAmount}</b></th></tr></thead>` : ''}
                                                <thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_total_amount}</b></th></tr></thead>
                                            </table>
                                    </td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td><p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600;">Billing Details</p><br /></td></tr>
                                    <tr><td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Landmark: ${landmark || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-bottom: 6px;">Phone: ${phone}</p>
                                    </td></tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74); line-height:18px; margin:0;">&copy; <strong>bazaar-uae.com</strong></p></td></tr>
                                    <tr><td style="height:80px;">&nbsp;</td></tr>
                                </table>
                        </td></tr>
                    </table>
                </body>`;

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
