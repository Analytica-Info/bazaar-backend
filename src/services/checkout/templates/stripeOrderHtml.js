'use strict';

/**
 * checkout/templates/stripeOrderHtml.js
 *
 * Pure HTML builders for Stripe order confirmation emails.
 * Extracted from use-cases/verifyStripePayment.js (PR email-template-extract).
 *
 * Accepts plain data only — no DB calls, no env reads, no logging.
 */

/**
 * Admin email for a new Stripe order.
 *
 * @param {object} p
 * @param {string} p.logoUrl
 * @param {string} p.nextOrderId
 * @param {string} p.orderDateTime
 * @param {string} p.formattedDeliveryDate
 * @param {string} p.purchaseDetails  - pre-rendered HTML rows
 * @param {string} p.subTotalAmount
 * @param {string} p.formattedshippingCost
 * @param {string} p.discountAmount
 * @param {string} p.totalAmount
 * @param {string} p.formattedPaymentMethod
 * @param {string} p.name
 * @param {string} p.userEmail
 * @param {string} p.city
 * @param {string} p.area
 * @param {string} p.buildingName
 * @param {string} p.floorNo
 * @param {string} p.apartmentNo
 * @param {string} p.landmark
 * @param {string} p.phone
 * @returns {string}
 */
function buildStripeAdminOrderHtml(p) {
    const {
        logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        subTotalAmount, formattedshippingCost, discountAmount, totalAmount, formattedPaymentMethod,
        name, userEmail, city, area, buildingName, floorNo, apartmentNo, landmark, phone,
    } = p;

    return `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0"><table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;"><tr><td><table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td style="height:40px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><a href="https://www.bazaar-uae.com" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Order No:</b> ${nextOrderId}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Date & Time:</b> ${orderDateTime}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p><p style="color: #455056; font-size: 16px; font-weight: bold;"><b>Payment Method:</b> ${formattedPaymentMethod}</p></td></tr><tr><td style="height:30px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>A new order has been placed on Bazaar.</b></p><p style="color: #455056; font-size: 16px;">Below are the order details:</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);"><thead><tr style="background-color: #f8f9fa;"><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th></tr></thead><tbody style="font-size: 14px;">${purchaseDetails}</tbody><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${subTotalAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discountAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${totalAmount}</b></th></tr></thead></table></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 22px; font-weight: 600;">Customer Information</p><br /></td></tr><tr><td><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Name: ${name}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Email: ${userEmail}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">City: ${city || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Area: ${area || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Building Name: ${buildingName || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Floor No: ${floorNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Apartment No: ${apartmentNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Landmark: ${landmark || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Phone: ${phone}</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74);">&copy; <strong>bazaar-uae.com</strong></p></td></tr><tr><td style="height:80px;">&nbsp;</td></tr></table></td></tr></table></body>`;
}

/**
 * User confirmation email for a Stripe order.
 *
 * @param {object} p  (same shape as buildStripeAdminOrderHtml)
 * @returns {string}
 */
function buildStripeUserOrderHtml(p) {
    const {
        logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        subTotalAmount, formattedshippingCost, discountAmount, totalAmount, formattedPaymentMethod,
        name, userEmail, city, area, buildingName, floorNo, apartmentNo, landmark, phone,
    } = p;

    return `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0"><table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;"><tr><td><table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td style="height:40px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><a href="https://www.bazaar-uae.com" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Order No:</b> ${nextOrderId}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Date & Time:</b> ${orderDateTime}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Get it By:</b> ${formattedDeliveryDate}</p><p style="color: #455056; font-size: 16px; font-weight: bold;"><b>Payment Method:</b> ${formattedPaymentMethod}</p></td></tr><tr><td style="height:30px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>${name}</b>! Thank you for your order with Bazaar!</p><p style="color: #455056; font-size: 16px;">We have received your order and are processing it. Below are the details of your purchase</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);"><thead><tr style="background-color: #f8f9fa;"><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th></tr></thead><tbody style="font-size: 14px;">${purchaseDetails}</tbody><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${subTotalAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discountAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${totalAmount}</b></th></tr></thead></table></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 22px; font-weight: 600;">Billing Details</p><br /></td></tr><tr><td><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Name: ${name}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Email: ${userEmail}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">City: ${city || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Area: ${area || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Building Name: ${buildingName || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Floor No: ${floorNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Apartment No: ${apartmentNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Landmark: ${landmark || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Phone: ${phone}</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74);">&copy; <strong>bazaar-uae.com</strong></p></td></tr><tr><td style="height:80px;">&nbsp;</td></tr></table></td></tr></table></body>`;
}

module.exports = { buildStripeAdminOrderHtml, buildStripeUserOrderHtml };
