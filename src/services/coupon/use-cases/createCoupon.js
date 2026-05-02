'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const CouponsCount = require('../../../repositories').couponsCount.rawModel();
const { sendEmail } = require('../../../mail/emailService');
const { getAdminEmail, getCcEmails } = require('../../../utilities/emailHelper');
const clock = require('../../../utilities/clock');
const { generateCouponCode } = require('../domain/couponCode');

const WEBURL = process.env.URL;

/**
 * Generate personalized coupon
 * @param {string} userId
 * @param {Object} data - { name, phone }
 */
async function createCoupon(userId, data) {
    try {
        const { name, phone } = data;

        if (!name || !phone) {
            throw { status: 400, message: "Name and phone are required." };
        }

        const existingUser = await Coupon.findOne({ phone });
        if (existingUser) {
            throw { status: 400, message: "Phone already exists" };
        }

        const couponsCountDoc = await CouponsCount.findOne();
        const totalCouponLimit = couponsCountDoc.count;
        const currentCouponCount = await Coupon.countDocuments();
        const remainingCoupons = totalCouponLimit - currentCouponCount;

        if (remainingCoupons <= 0) {
            throw { status: 400, message: "All coupons have been claimed. No more coupons available." };
        }

        const lastCoupon = await Coupon.findOne().sort({ _id: -1 }).select("id").lean();
        const nextId = lastCoupon && typeof lastCoupon.id === "number" ? lastCoupon.id + 1 : 1;

        const couponCode = await generateCouponCode();
        const discount = 10;
        const validFrom = clock.now();
        const validUntil = new Date(validFrom);
        validUntil.setMonth(validFrom.getMonth() + 1);

        const newCoupon = new Coupon({ id: nextId, coupon: couponCode, name, phone, user_id: userId, discount, validFrom, validUntil, isActive: true });
        await newCoupon.save();

        const logoUrl = `${WEBURL}/images/logo.png`;

        if (remainingCoupons <= 10) {
            const adminEmail = await getAdminEmail();
            const ccEmail = await getCcEmails();
            const alertHtml = buildAlertEmail(logoUrl, totalCouponLimit, currentCouponCount, remainingCoupons);
            await sendEmail(adminEmail, "ALERT: Only 10 Coupons Remaining - Bazaar", alertHtml, ccEmail);
        }

        const adminEmail = await getAdminEmail();
        const adminHtml = buildNewCouponEmail(logoUrl, name, phone, couponCode);
        await sendEmail(adminEmail, "New Coupon Code Generated - Bazaar", adminHtml);

        return { success: true, message: "Coupon created successfully.", coupon: newCoupon };
    } catch (error) {
        if (error.status) throw error;
        console.error(error);
        throw { status: 500, message: "Error creating coupon." };
    }
}

function buildAlertEmail(logoUrl, totalCouponLimit, currentCouponCount, remainingCoupons) {
    return `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
      <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;">
        <tr><td>
          <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
            <tr><td style="height:40px;">&nbsp;</td></tr>
            <tr><td style="text-align:center;"><a href="https://bazaar-uae.com/" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr>
            <tr><td style="height:20px;">&nbsp;</td></tr>
            <tr><td>
              <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                <tr><td style="height:40px;">&nbsp;</td></tr>
                <tr><td style="padding:0 35px;">
                  <h6 style="color:#d32f2f; font-weight:700; margin:0;font-size:20px;font-family:'Rubik',sans-serif;"><b>ALERT: Only Less than 10 Coupons Remaining</b></h6>
                  <p style="color:#455056; font-size:16px; margin: 10px 0 0 0; font-weight: 500;">
                    Dear Bazaar Team,<br>This is an automated alert to inform you that only <b>less than 10 coupons</b> are remaining in your system.<br><br>
                    <b>Total Allowed Coupons:</b> ${totalCouponLimit}<br>
                    <b>Coupons Issued:</b> ${currentCouponCount}<br>
                    <b>Coupons Remaining:</b> ${remainingCoupons}
                  </p>
                  <br><p style="color:#d32f2f; font-size:16px; font-weight:600;">Please take necessary action to replenish or update your coupon settings.</p>
                  <br><h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"><b>Thank You,</b></h6>
                </td></tr>
                <tr><td style="height:40px;">&nbsp;</td></tr>
              </table>
            </td></tr>
            <tr><td style="height:20px;">&nbsp;</td></tr>
            <tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74); line-height:18px; margin:0;">&copy; <strong>bazaar-uae.com</strong></p></td></tr>
            <tr><td style="height:80px;">&nbsp;</td></tr>
          </table>
        </td></tr>
      </table>
    </body>`;
}

function buildNewCouponEmail(logoUrl, name, phone, couponCode) {
    return `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
      <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;">
        <tr><td>
          <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
            <tr><td style="height:40px;">&nbsp;</td></tr>
            <tr><td style="text-align:center;"><a href="https://bazaar-uae.com/" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr>
            <tr><td style="height:20px;">&nbsp;</td></tr>
            <tr><td>
              <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                <tr><td style="height:40px;">&nbsp;</td></tr>
                <tr><td style="padding:0 35px;">
                  <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"><b>Dear Bazaar Team,</b></h6>
                  <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; font-weight: 500;">We are pleased to inform you that we have generated a coupon code for a new customer.</p>
                  <br>
                  <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px;">Name<br><span style="font-weight:500;">${name}</span></p>
                  <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px;">Phone Number<br><span style="font-weight:500;">${phone}</span></p>
                  <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px;">Coupon Code<br><span style="font-weight:500;">${couponCode}</span></p>
                  <br><h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"><b>Thank You,</b></h6>
                </td></tr>
                <tr><td style="height:40px;">&nbsp;</td></tr>
              </table>
            </td></tr>
            <tr><td style="height:20px;">&nbsp;</td></tr>
            <tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74); line-height:18px; margin:0;">&copy; <strong>bazaar-uae.com</strong></p></td></tr>
            <tr><td style="height:80px;">&nbsp;</td></tr>
          </table>
        </td></tr>
      </table>
    </body>`;
}

module.exports = { createCoupon };
