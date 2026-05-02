'use strict';

/**
 * use-cases/verifyNomodPayment.js
 *
 * Verify Nomod payment + create order (website flow).
 * Extracted from checkoutService (PR-MOD-4).
 *
 * BUG-010: year const captured at module load time.
 */

const crypto = require('crypto');

// BUG-010: module-load const
const year = new Date().getFullYear();

const repositories = require('../../../repositories');
const Order = repositories.orders.rawModel();
const OrderDetail = repositories.orderDetails.rawModel();
const PendingPayment = repositories.pendingPayments.rawModel();
const Coupon = repositories.coupons.rawModel();
const BankPromoCode = repositories.bankPromoCodes.rawModel();
const BankPromoCodeUsage = repositories.bankPromoCodeUsages.rawModel();
const Notification = repositories.notifications.rawModel();
const User = repositories.users.rawModel();

const PaymentProviderFactory = require('../../payments/PaymentProviderFactory');
const logger = require('../../../utilities/logger');

/**
 * @param {object} req - Express request object
 * @returns {Promise<{ message: string, orderId: string }>}
 */
async function verifyNomodPayment(req) {
  try {
    const { paymentId } = req.body;
    const userId = req.user?._id;

    if (!paymentId) {
      throw { status: 400, message: 'paymentId is required' };
    }

    const provider = PaymentProviderFactory.create('nomod');
    const checkout = await provider.getCheckout(paymentId);

    if (!checkout.paid) {
      throw { status: 400, message: `Payment status is ${checkout.status}` };
    }

    const pendingPayment = await PendingPayment.findOne({ payment_id: paymentId });
    if (!pendingPayment) {
      throw { status: 404, message: 'Pending payment record not found' };
    }
    if (pendingPayment.status === 'completed') {
      return { message: 'Order already created' };
    }

    const {
      cartData, shippingCost, name, phone, address, city, area,
      buildingName, floorNo, apartmentNo, landmark, currency,
      discountAmount, couponCode, mobileNumber, saved_total,
      bankPromoId, subtotalAmount, totalAmount,
    } = pendingPayment.order_data;

    pendingPayment.status = 'completed';
    await pendingPayment.save();

    const formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedShipping = formatter.format(shippingCost || 0);

    if (couponCode && mobileNumber) {
      const coupon = await Coupon.findOne({ coupon: couponCode, phone: mobileNumber });
      if (coupon && coupon.status !== 'used') {
        coupon.status = 'used';
        await coupon.save();
      }
    }

    if (bankPromoId && userId) {
      try {
        const promo = await BankPromoCode.findById(bankPromoId);
        if (promo) {
          const existing = await BankPromoCodeUsage.findOne({ bankPromoCodeId: promo._id, userId });
          if (!existing) {
            await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId });
            promo.usageCount = (promo.usageCount || 0) + 1;
            await promo.save();
            logger.info(`Bank promo ${promo.code} usage recorded for user ${userId} (Nomod).`);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error recording bank promo usage (Nomod):');
      }
    }

    const formatDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
    const formatTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
    const orderDateTime = `${formatDate} - ${formatTime}`;

    const lastOrder = await Order.findOne().sort({ createdAt: -1 }).select('order_no');
    let nextOrderNo = 1;
    if (lastOrder && lastOrder.order_no) nextOrderNo = lastOrder.order_no + 1;

    const uniquePart = crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
    const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(3, '0')}${uniquePart}`;

    const user = await User.findById(userId);
    const userEmail = user?.email || '';

    const order = await Order.create({
      userId, order_id: nextOrderId, order_no: nextOrderNo,
      order_datetime: orderDateTime, name, email: userEmail, address,
      state: '-', city: city || '-', area: area || '-',
      buildingName: buildingName || '-', floorNo: floorNo || '-',
      apartmentNo: apartmentNo || '-', landmark: landmark || '-',
      amount_subtotal: subtotalAmount, amount_total: totalAmount,
      discount_amount: discountAmount, phone, status: 'confirmed',
      shipping: shippingCost, txn_id: paymentId, payment_status: 'paid',
      checkout_session_id: paymentId, payment_method: 'nomod',
      saved_total: saved_total || 0, orderfrom: 'Website',
    });

    const orderDetails = cartData.map(item => ({
      order_id: order._id, product_id: item.id, productId: item.product_id,
      product_name: item.name, product_image: item.image,
      variant_name: item.variant, amount: item.price, quantity: item.qty,
    }));
    await OrderDetail.insertMany(orderDetails);

    await Notification.create({
      userId,
      title: `Order No: ${order.order_id} Placed Successfully`,
      message: `Hi ${name}, your order of AED ${Number(totalAmount).toFixed(2)} is confirmed. Thank you for shopping with Bazaar!`,
    });

    order.orderTracks = order.orderTracks || [];
    order.orderTracks.push({ status: 'Confirmed', dateTime: orderDateTime, image: null });
    await order.save();

    logger.info({ orderId: nextOrderId, userId }, 'Nomod order created successfully');
    return { message: 'Order created successfully', orderId: order._id };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Nomod verifyPayment error:');
    throw { status: 500, message: 'Internal server error' };
  }
}

module.exports = verifyNomodPayment;
