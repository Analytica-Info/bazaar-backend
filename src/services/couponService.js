const Coupon = require('../repositories').coupons.rawModel();
const CouponsCount = require('../repositories').couponsCount.rawModel();
const BankPromoCode = require('../repositories').bankPromoCodes.rawModel();
const BankPromoCodeUsage = require('../repositories').bankPromoCodeUsages.rawModel();
const User = require('../repositories').users.rawModel();
const axios = require("axios");
const { sendEmail } = require("../mail/emailService");
const { getAdminEmail, getCcEmails } = require("../utilities/emailHelper");

const logger = require("../utilities/logger");
const clock = require("../utilities/clock");
const API_KEY = process.env.API_KEY;
const WEBURL = process.env.URL;

// ─── Private Helpers ─────────────────────────────────────────────

const generateCouponCode = async () => {
  try {
    // Fetch only the last coupon by _id — avoids loading the entire collection.
    const lastCouponDoc = await Coupon.findOne({ coupon: /^DH\d+YHZXB$/ })
      .sort({ _id: -1 })
      .select("coupon")
      .lean();

    let nextNumber = 1;
    if (lastCouponDoc) {
      const matches = lastCouponDoc.coupon.match(/DH(\d+)YHZXB/);
      if (matches && matches[1]) {
        nextNumber = parseInt(matches[1], 10) + 1;
      }
    }

    return `DH${nextNumber}YHZXB`;
  } catch (error) {
    logger.error({ err: error }, "Error generating the coupon code:");
    return "DH1YHZXB";
  }
};

const fetchCouponDetails = async (id) => {
  try {
    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/promotions/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    if (response?.data?.data) {
      return response.data.data;
    }

    logger.error("Invalid promotion response format.");
    return null;
  } catch (error) {
    console.error(
      `Error fetching coupon details for ID: ${id} ->`,
      error.response?.data || error.message
    );
    return null;
  }
};

// ─── Exported Functions ──────────────────────────────────────────

/**
 * Get coupon count (total documents)
 */
exports.getCoupons = async () => {
  try {
    logger.info("API - Coupons");
    const couponCount = await Coupon.countDocuments();

    logger.info("Return - API - Coupons");
    return {
      success: true,
      count: couponCount,
    };
  } catch (error) {
    console.error(error);
    throw {
      status: 500,
      message: "An error occurred while fetching coupon count.",
    };
  }
};

/**
 * Get CouponsCount total
 */
exports.getCouponCount = async () => {
  try {
    const newCouponCount = await CouponsCount.findOne();
    if (!newCouponCount) {
      throw { status: 404, message: "Coupon count data not found" };
    }
    return { couponCountData: newCouponCount };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw { status: 500, message: "Error fetching coupon count" };
  }
};

/**
 * Increment coupon count
 * @param {number} count - the number to increment by
 */
exports.updateCouponCount = async (count) => {
  try {
    if (typeof count !== "number") {
      throw { status: 400, message: "Count must be a number" };
    }

    const updatedCouponCount = await CouponsCount.findOneAndUpdate(
      {},
      { $inc: { count } },
      { new: true, upsert: true }
    );

    return {
      message: "Coupon count updated successfully",
      data: updatedCouponCount,
    };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw { status: 500, message: "Error updating coupon count" };
  }
};

/**
 * Validate coupon code (FIRST15, bank promos)
 * @param {string} code - the coupon code
 * @param {string} userId - the user ID (for single-use promo checks)
 * @param {Object} cartData - unused currently but passed for future use
 */
exports.checkCouponCode = async (code, userId, cartData) => {
  if (!code || !String(code).trim()) {
    throw { status: 400, message: "Coupon code is required." };
  }

  const codeTrimmed = String(code).trim();

  if (codeTrimmed === "UAE10") {
    const couponDetails = await fetchCouponDetails(
      "1991824943058366464"
    );
    if (!couponDetails) {
      throw { status: 404, message: "Coupon details not found." };
    }
    const { start_time, end_time, status } = couponDetails;
    const currentDubaiTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })
    );
    const startTime = new Date(start_time);
    const endTime = new Date(end_time);
    if (status !== "active") {
      throw {
        status: 400,
        message: "This promotion is not active.",
      };
    }
    if (currentDubaiTime < startTime) {
      throw {
        status: 400,
        message: "Promotion has not started yet.",
      };
    }
    if (currentDubaiTime > endTime) {
      throw { status: 400, message: "Promotion has expired." };
    }
    return {
      message: "Coupon code is valid.",
      type: "coupon",
      discountPercent: 10,
    };
  }

  try {
    const coupon = await Coupon.findOne({
      coupon: codeTrimmed,
      status: "unused",
    });
    if (coupon) {
      return {
        message: "Coupon code is valid.",
        type: "coupon",
        discountPercent: 10,
      };
    }

    const promoCode = await BankPromoCode.findOne({
      code: codeTrimmed.toUpperCase(),
      active: true,
    }).lean();
    if (promoCode) {
      const now = clock.now();
      const expiry = new Date(promoCode.expiryDate);
      if (expiry < now) {
        throw {
          status: 400,
          message: "This promo code has expired.",
        };
      }
      if (promoCode.singleUsePerCustomer && userId) {
        const alreadyUsed = await BankPromoCodeUsage.findOne({
          bankPromoCodeId: promoCode._id,
          userId: userId,
        });
        if (alreadyUsed) {
          throw {
            status: 400,
            message:
              "You have already used this promo code. It is limited to one use per customer.",
          };
        }
      }
      return {
        message: `Promo code applied: ${promoCode.discountPercent}% off${
          promoCode.capAED
            ? ` (max ${promoCode.capAED} AED)`
            : ""
        }.`,
        type: "promo",
        discountPercent: promoCode.discountPercent,
        capAED: promoCode.capAED || null,
        bankPromoId: promoCode._id.toString(),
      };
    }

    throw {
      status: 404,
      message:
        "Coupon/promo code is not valid or has already been used.",
    };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Error checking coupon code:");
    throw { status: 500, message: "Internal server error." };
  }
};

/**
 * Verify coupon eligibility (redeem step)
 * @param {string} userId - unused currently
 * @param {string} coupon - the coupon code
 * @param {string} phone - mobile number
 */
exports.redeemCoupon = async (userId, coupon, phone) => {
  if (!coupon) {
    throw { status: 400, message: "Coupon code is required." };
  }

  if (coupon === "UAE10") {
    const couponDetails = await fetchCouponDetails(
      "1991824943058366464"
    );

    if (!couponDetails) {
      throw { status: 404, message: "Coupon details not found." };
    }

    const { start_time, end_time, status } = couponDetails;

    const currentDubaiTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })
    );

    const startTime = new Date(start_time);
    const endTime = new Date(end_time);

    if (status !== "active") {
      throw {
        status: 400,
        message: "This promotion is not active.",
      };
    }

    if (currentDubaiTime < startTime) {
      throw {
        status: 400,
        message: "Promotion has not started yet.",
      };
    }

    if (currentDubaiTime > endTime) {
      throw { status: 400, message: "Promotion has expired." };
    }

    return { message: "Coupon code is valid." };
  }

  if (!coupon || !phone) {
    throw {
      status: 400,
      message: "Coupon code and mobile number are required.",
    };
  }

  try {
    const couponDoc = await Coupon.findOne({
      coupon: coupon,
      phone: phone,
    });

    if (couponDoc) {
      return {
        message:
          "Coupon code is valid. Please proceed with the payment.",
      };
    } else {
      throw {
        status: 404,
        message:
          "Coupon code is not valid or not associated with this mobile number.",
      };
    }
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Error redeeming coupon:");
    throw { status: 500, message: "Internal server error." };
  }
};

/**
 * Generate personalized coupon
 * @param {string} userId
 * @param {Object} data - { name, phone }
 */
exports.createCoupon = async (userId, data) => {
  try {
    const { name, phone } = data;

    if (!name || !phone) {
      throw {
        status: 400,
        message: "Name and phone are required.",
      };
    }

    const existingUser = await Coupon.findOne({ phone });
    if (existingUser) {
      throw { status: 400, message: "Phone already exists" };
    }

    // 1. Get total coupon limit from CouponsCount
    const couponsCountDoc = await CouponsCount.findOne();
    const totalCouponLimit = couponsCountDoc.count;

    // 2. Get current coupon count
    const currentCouponCount = await Coupon.countDocuments();

    // 3. Calculate remaining coupons
    const remainingCoupons = totalCouponLimit - currentCouponCount;

    if (remainingCoupons <= 0) {
      throw {
        status: 400,
        message:
          "All coupons have been claimed. No more coupons available.",
      };
    }

    // Sort by _id (always indexed) instead of id (numeric field with no index).
    const lastCoupon = await Coupon.findOne().sort({ _id: -1 }).select("id").lean();
    const nextId =
      lastCoupon && typeof lastCoupon.id === "number"
        ? lastCoupon.id + 1
        : 1;

    const couponCode = await generateCouponCode();

    const discount = 10;
    const validFrom = clock.now();
    const validUntil = new Date(validFrom);
    validUntil.setMonth(validFrom.getMonth() + 1);

    const newCoupon = new Coupon({
      id: nextId,
      coupon: couponCode,
      name,
      phone,
      user_id: userId,
      discount,
      validFrom,
      validUntil,
      isActive: true,
    });

    await newCoupon.save();

    const logoUrl = `${WEBURL}/images/logo.png`;

    // 4. Send email to admin if remaining coupons <= 10
    if (remainingCoupons <= 10) {
      const adminEmail = await getAdminEmail();
      const alertSubject = "ALERT: Only 10 Coupons Remaining - Bazaar";
      const alertHtml = `
    <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
      <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;">
        <tr>
          <td>
            <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
              align="center" cellpadding="0" cellspacing="0">
              <tr>
                <td style="height:40px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="text-align:center;">
                  <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                    <img width="110" src="${logoUrl}" title="logo" alt="logo">
                  </a>
                </td>
              </tr>
              <tr>
                <td style="height:20px;">&nbsp;</td>
              </tr>
              <tr>
                <td>
                  <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                    style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                    <tr>
                      <td style="height:40px;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding:0 35px;">
                        <br>
                        <h6 style="color:#d32f2f; font-weight:700; margin:0;font-size:20px;font-family:'Rubik',sans-serif;"> <b>ALERT: Only Less than 10 Coupons Remaining</b></h6>
                        <p style="color:#455056; font-size:16px; margin: 10px 0 0 0; font-weight: 500;">
                          Dear Bazaar Team,<br>
                          This is an automated alert to inform you that only <b>less than 10 coupons</b> are remaining in your system.<br>
                          <br>
                          <b>Total Allowed Coupons:</b> ${totalCouponLimit}<br>
                          <b>Coupons Issued:</b> ${currentCouponCount}<br>
                          <b>Coupons Remaining:</b> ${remainingCoupons}
                        </p>
                        <br>
                        <p style="color:#d32f2f; font-size:16px; font-weight:600;">Please take necessary action to replenish or update your coupon settings.</p>
                        <br>
                        <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b>Thank You,</b></h6>
                      </td>
                    </tr>
                    <tr>
                      <td style="height:40px;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="height:20px;">&nbsp;</td>
              </tr>
              <tr>
                <td style="text-align:center;">
                  <p style="font-size:14px; color:rgba(69, 80, 86, 0.74); line-height:18px; margin:0;">&copy; <strong>bazaar-uae.com</strong></p>
                </td>
              </tr>
              <tr>
                <td style="height:80px;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  `;
      const ccEmail = await getCcEmails();
      await sendEmail(adminEmail, alertSubject, alertHtml, ccEmail);
    }

    const adminEmail = await getAdminEmail();
    const adminSubject = "New Coupon Code Generated - Bazaar";
    const adminHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                                        <tr>
                                            <td>
                                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                                    align="center" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="height:40px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="text-align:center;">
                                                            <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                                            </a>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:20px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td>
                                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                                <tr>
                                                                    <td style="height:40px;">&nbsp;</td>
                                                                </tr>
                                                                <tr>
                                                                    <td style="padding:0 35px;">
                                                                        <br>
                                                                        <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Dear Bazaar Team,</b></h6>
                                                                        <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; color:rgba(0,0,0,.64); font-weight: 500;">
                                                                            We are pleased to inform you that we have generated a coupon code for a new customer and wish to provide you the details for your attention.
                                                                        </p>
                                                                        <br>
                                                                        <br>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Name <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${name}</p></p>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Phone Number <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${phone}</p></p>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Coupon Code <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${couponCode}</p></p>
                                                                        <br>
                                                                        <br>
                                                                        <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Thank You,</b></h6>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td style="height:40px;">&nbsp;</td>
                                                                </tr>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:20px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="text-align:center;">
                                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:80px;">&nbsp;</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </body>`;

    await sendEmail(adminEmail, adminSubject, adminHtml);

    return {
      success: true,
      message: "Coupon created successfully.",
      coupon: newCoupon,
    };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw { status: 500, message: "Error creating coupon." };
  }
};
