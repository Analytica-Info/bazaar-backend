'use strict';

/**
 * coupon/templates/couponEmailHtml.js
 *
 * Pure HTML builders for coupon notification emails.
 * Extracted from use-cases/createCoupon.js (PR email-template-extract).
 *
 * Accepts plain data only — no DB calls, no env reads, no logging.
 */

/**
 * Alert email sent to admin when fewer than 10 coupons remain.
 *
 * @param {object} p
 * @param {string} p.logoUrl
 * @param {number} p.totalCouponLimit
 * @param {number} p.currentCouponCount
 * @param {number} p.remainingCoupons
 * @returns {string}
 */
function buildCouponAlertHtml(p) {
    const { logoUrl, totalCouponLimit, currentCouponCount, remainingCoupons } = p;

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

/**
 * Admin notification email when a new coupon is generated for a customer.
 *
 * @param {object} p
 * @param {string} p.logoUrl
 * @param {string} p.name
 * @param {string} p.phone
 * @param {string} p.couponCode
 * @returns {string}
 */
function buildNewCouponHtml(p) {
    const { logoUrl, name, phone, couponCode } = p;

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

module.exports = { buildCouponAlertHtml, buildNewCouponHtml };
