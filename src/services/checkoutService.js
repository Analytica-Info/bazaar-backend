const Order = require("../models/Order");
const OrderDetail = require("../models/OrderDetail");
const Cart = require("../models/Cart");
const CartData = require("../models/CartData");
const User = require("../models/User");
const Product = require("../models/Product");
const PendingPayment = require("../models/PendingPayment");
const Coupon = require("../models/Coupon");
const BankPromoCode = require("../models/BankPromoCode");
const BankPromoCodeUsage = require("../models/BankPromoCodeUsage");
const Notification = require("../models/Notification");
const stripe = require("stripe")(process.env.STRIPE_SK);
const axios = require("axios");
const PaymentProviderFactory = require("./payments/PaymentProviderFactory");
const crypto = require("crypto");
const { sendEmail } = require("../mail/emailService");
const { getAdminEmail, getCcEmails } = require("../utilities/emailHelper");
const { logActivity } = require("../utilities/activityLogger");
const { logBackendActivity } = require("../utilities/backendLogger");

const logger = require("../utilities/logger");
const year = new Date().getFullYear();
const API_KEY = process.env.API_KEY;
const PRODUCTS_UPDATE = process.env.PRODUCTS_UPDATE;
const ENVIRONMENT = process.env.ENVIRONMENT;
const WEBURL = process.env.URL;

// ─── Private Helpers ─────────────────────────────────────────────

function computeCartDiscountAED(subtotal, discountPercent, capAED) {
  const pct = Number(discountPercent) || 0;
  if (pct <= 0) return 0;
  const s = Number(subtotal);
  let byPercent = (s * pct) / 100;
  if (capAED != null && capAED !== "" && Number(capAED) > 0) {
    byPercent = Math.min(byPercent, Number(capAED));
  }
  return Math.round(byPercent * 100) / 100;
}

function cartSubtotalFromCartData(cartData) {
  return cartData.reduce(
    (s, item) => s + Number(item.price) * Number(item.qty),
    0
  );
}

async function resolveCheckoutDiscountAED({
  cartData,
  bankPromoId,
  discountPercent,
  discountAmount,
  capAED,
}) {
  const subtotalBefore = cartSubtotalFromCartData(cartData);
  if (bankPromoId) {
    try {
      const promo = await BankPromoCode.findById(bankPromoId).lean();
      if (promo && promo.active && new Date(promo.expiryDate) >= new Date()) {
        return {
          discountAED: computeCartDiscountAED(
            subtotalBefore,
            promo.discountPercent,
            promo.capAED
          ),
          subtotalBefore,
        };
      }
    } catch (e) {
      logger.error({ err: e }, "resolveCheckoutDiscountAED bankPromoId");
    }
  }
  const pct = Number(discountPercent) || 0;
  if (pct > 0) {
    return {
      discountAED: computeCartDiscountAED(subtotalBefore, pct, capAED),
      subtotalBefore,
    };
  }
  return {
    discountAED: Math.max(0, Number(discountAmount) || 0),
    subtotalBefore,
  };
}

async function clearUserCart(user_id) {
  try {
    const cart = await Cart.findOne({ user: user_id });
    if (cart) {
      cart.items = [];
      await cart.save();
      logger.info(`Cart cleared for user: ${user_id}`);
    }
  } catch (err) {
    logger.error({ err: err }, "Error clearing cart:");
  }
}

function getUaeDateTime() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const yr = parseInt(parts.find((p) => p.type === "year").value);
  const month =
    parseInt(parts.find((p) => p.type === "month").value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day").value);
  const hour = parseInt(parts.find((p) => p.type === "hour").value);
  const minute = parseInt(parts.find((p) => p.type === "minute").value);
  const second = parseInt(parts.find((p) => p.type === "second").value);
  const milliseconds = now.getMilliseconds();

  return `${yr}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}+04:00`;
}

async function createPercentageCoupon(percent) {
  const coupon = await stripe.coupons.create({
    percent_off: percent,
    duration: "once",
  });
  return coupon.id;
}

async function getDiagnosticInventory(lightspeedVariantId) {
  const diag = {
    lightspeedQty: null,
    localQty: null,
    lightspeedError: null,
    localError: null,
  };
  try {
    const invRes = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${lightspeedVariantId}/inventory`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );
    diag.lightspeedQty =
      invRes.data?.data?.[0]?.inventory_level ?? null;
  } catch (e) {
    diag.lightspeedError = e?.message || String(e);
  }
  try {
    const doc = await Product.findOne({
      $or: [
        { "product.id": lightspeedVariantId },
        { "variantsData.id": lightspeedVariantId },
      ],
    }).lean();
    const v = doc?.variantsData?.find(
      (vv) => String(vv.id) === String(lightspeedVariantId)
    );
    diag.localQty = v != null ? v.qty : null;
    if (!doc) diag.localError = "Product not found in local DB";
    else if (v == null)
      diag.localError = `Variant ${lightspeedVariantId} not in variantsData`;
  } catch (e) {
    diag.localError = e?.message || String(e);
  }
  return diag;
}

const fetchProductDetails = async (id) => {
  try {
    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    let product = response.data.data;
    if (!product) throw new Error("Product not found.");

    const variantsData = [];
    let totalQty = 0;

    if (product.variants.length === 0) {
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}/inventory`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      const inventoryLevel =
        inventoryResponse.data.data?.[0]?.inventory_level || 0;

      if (
        inventoryLevel > 0 &&
        parseFloat(product.price_standard.tax_inclusive) !== 0
      ) {
        variantsData.push({
          qty: inventoryLevel,
          id: product.id,
          sku: product.sku_number,
          name: product.name,
          price: product.price_standard.tax_inclusive,
        });
        totalQty += inventoryLevel;
      }
    } else {
      for (const variant of product.variants) {
        const variantId = variant.id;
        const variantPrice = variant.price_standard.tax_inclusive;
        const variantDefinitions = variant.variant_definitions;
        let sku = "";
        if (variantDefinitions && variantDefinitions.length > 0) {
          const values = variantDefinitions.map((def) => def.value);
          sku = values.join(" - ");
        }
        const inventoryResponse = await axios.get(
          `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: "application/json",
            },
          }
        );
        const inventoryLevel =
          inventoryResponse.data.data?.[0]?.inventory_level || 0;

        if (inventoryLevel > 0 && parseFloat(variantPrice) !== 0) {
          variantsData.push({
            qty: inventoryLevel,
            sku: sku,
            price: variantPrice,
            id: variantId,
            name: variant.name,
          });
          totalQty += inventoryLevel;
        }
      }
    }
    return { product, variantsData, totalQty };
  } catch (error) {
    console.error(
      `Error fetching product details for ID: ${id}`,
      error.message
    );
    throw error;
  }
};

async function updateQuantityMail(emailDetails) {
  try {
    const email = await getAdminEmail();
    const logoUrl = `${WEBURL}/images/logo.png`;
    const subject = "Inventory Update Report - Bazaar";
    const html = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Product Quantity Update Report</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">The following products have been updated in the inventory:</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Product Name</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Variant ID</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Quantity Sold</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Quantity Remaining</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Update Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                    ${emailDetails
                                                      .map(
                                                        (item) => `
                                                        <tr>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.productName}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.variantId}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.qtySold}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.qtyRemaining}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.updateStatus}</td>
                                                        </tr>
                                                    `
                                                      )
                                                      .join("")}
                                                </tbody>
                                            </table>
                                            <p style="margin-top:20px;">Please log in to the dashboard to confirm the updates.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0; padding-left: 15px; padding-right: 15px;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </body>`;

    await sendEmail(email, subject, html);
  } catch (error) {
    console.warn(
      "Error sending mail to admin:",
      error.response ? error.response.data : error.message
    );
    return false;
  }
}

async function updateQuantities(cartData, orderId = null) {
  try {
    const emailDetails = [];
    const updateResults = await Promise.all(
      cartData.map(async (item, index) => {
        const updateQty = item.total_qty - item.qty;
        const mongoId = item.id;
        const name = item.name;
        const lightspeedVariantId = item.variantId || item.product_id;

        const beforeDiag = await getDiagnosticInventory(lightspeedVariantId);

        let update = false;
        try {
          update = true;
        } catch (lsError) {
          const afterDiagOnThrow = await getDiagnosticInventory(lightspeedVariantId);
          const qtyMsgThrow = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER (unchanged): Lightspeed=${afterDiagOnThrow.lightspeedQty} Local=${afterDiagOnThrow.localQty} | Expected=${updateQty}. Lightspeed API THREW: ${lsError?.message}`;
          await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API threw. ${qtyMsgThrow}`,
            user: null,
            details: {
              order_id: orderId,
              product_id: lightspeedVariantId?.toString?.(),
              product_name: name,
              error_details: lsError?.message,
              response_data: lsError?.response?.data || null,
              qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
              qty_after: { lightspeed: afterDiagOnThrow.lightspeedQty, local: afterDiagOnThrow.localQty },
              expected_after: updateQty,
              qty_sold: item.qty,
            }
          });
          await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Product Database Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API threw. ${qtyMsgThrow}`,
            product_id: lightspeedVariantId?.toString?.(),
            product_name: name,
            order_id: orderId,
            execution_path: 'checkoutService.updateQuantities -> Lightspeed API',
            error_details: qtyMsgThrow
          });
          throw lsError;
        }

        if (update) {
          const mongoObjectId = mongoId && typeof mongoId === 'string' ? mongoId : mongoId?.toString?.();
          let updatedEntry = null;
          try {
            const qtySold = item.qty || 0;
            const currentDoc = await Product.findById(mongoObjectId).lean();
            if (!currentDoc) {
              throw new Error(`Product not found for _id=${mongoObjectId}`);
            }
            const mainProductId = currentDoc.product?.id;
            let variantsData = [];
            if (mainProductId) {
              try {
                const fetched = await fetchProductDetails(mainProductId);
                variantsData = Array.isArray(fetched.variantsData) ? fetched.variantsData.map((v) => ({ ...v })) : [];
              } catch (fetchErr) {
                variantsData = Array.isArray(currentDoc.variantsData) ? currentDoc.variantsData.map((v) => ({ ...v })) : [];
              }
            } else {
              variantsData = Array.isArray(currentDoc.variantsData) ? currentDoc.variantsData.map((v) => ({ ...v })) : [];
            }
            const variantIndex = variantsData.findIndex((v) => String(v.id) === String(lightspeedVariantId));
            if (variantIndex >= 0) {
              variantsData[variantIndex].qty = updateQty;
            } else {
              variantsData.push({ id: lightspeedVariantId, qty: updateQty });
            }
            const totalQty = variantsData.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
            const productStatus = totalQty > 0 ? true : false;
            updatedEntry = await Product.findByIdAndUpdate(
              mongoObjectId,
              {
                $set: { variantsData, totalQty, status: productStatus },
                $inc: { sold: qtySold },
              },
              { new: true }
            );
            if (updatedEntry) {
              const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
              const qtyMsg = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty} QtySold=${item.qty}`;
              await logActivity({
                platform: 'Website Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'success',
                message: `Product ${name} updated successfully. ${qtyMsg}`,
                user: null,
                details: {
                  order_id: orderId,
                  product_id: lightspeedVariantId?.toString?.(),
                  product_name: name,
                  qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                  qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
                  expected_after: updateQty,
                  qty_sold: item.qty,
                  total_before: item.total_qty,
                }
              });
              await logBackendActivity({
                platform: 'Website Backend',
                activity_name: 'Product Database Update',
                status: 'success',
                message: `Product ${name} updated. ${qtyMsg}`,
                product_id: lightspeedVariantId?.toString?.(),
                product_name: name,
                order_id: orderId,
                execution_path: 'checkoutService.updateQuantities -> Product.findOneAndUpdate'
              });
            } else {
              const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
              const qtyMsgFail = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty}. Local DB sync FAILED.`;
              await logActivity({
                platform: 'Website Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'failure',
                message: `Product ${name} - Lightspeed updated but local DB NOT synced. ${qtyMsgFail}`,
                user: null,
                details: {
                  order_id: orderId,
                  product_id: lightspeedVariantId?.toString?.(),
                  product_name: name,
                  error_details: 'findOneAndUpdate returned null - product may not exist in local DB',
                  qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                  qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
                  expected_after: updateQty,
                  qty_sold: item.qty,
                }
              });
              await logBackendActivity({
                platform: 'Website Backend',
                activity_name: 'Product Database Update',
                status: 'failure',
                message: `Product ${name} - local DB sync failed. ${qtyMsgFail}`,
                product_id: lightspeedVariantId?.toString?.(),
                product_name: name,
                order_id: orderId,
                execution_path: 'checkoutService.updateQuantities -> Product.findOneAndUpdate',
                error_details: `findOneAndUpdate returned null. ${qtyMsgFail}`
              });
            }
          } catch (dbError) {
            throw dbError;
          }
        } else {
          const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
          const qtyMsgLsFail = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER (unchanged): Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty}. Lightspeed API update FAILED.`;
          await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API update failed. ${qtyMsgLsFail}`,
            user: null,
            details: {
              order_id: orderId,
              product_id: lightspeedVariantId?.toString?.(),
              product_name: name,
              error_details: 'Lightspeed API updateQuantity returned false',
              qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
              qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
              expected_after: updateQty,
              qty_sold: item.qty,
              lightspeedError: beforeDiag.lightspeedError || undefined,
            }
          });
          await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Product Database Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API failed. ${qtyMsgLsFail}`,
            product_id: lightspeedVariantId?.toString?.(),
            product_name: name,
            order_id: orderId,
            execution_path: 'checkoutService.updateQuantities -> Lightspeed API',
            error_details: qtyMsgLsFail
          });
        }

        emailDetails.push({
          productName: name,
          variantId: lightspeedVariantId,
          qtySold: item.qty,
          qtyRemaining: updateQty,
          updateStatus: update ? "Successful" : "Failed",
        });

        console.log(
          `Update for product ID ${lightspeedVariantId?.toString?.()}, Name ${name} was ${
            update ? "successful" : "failed"
          }`
        );
        return update;
      })
    );

    console.log("All updates completed:", updateResults);
    await updateQuantityMail(emailDetails);

    const successCount = updateResults.filter((r) => r === true).length;
    const failureCount = updateResults.filter((r) => r === false).length;
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Inventory Update Batch',
      status: successCount > 0 ? 'success' : 'failure',
      message: `Inventory update completed: ${successCount} success, ${failureCount} failed`,
      order_id: orderId,
      execution_path: 'checkoutService.updateQuantities'
    });

    return updateResults;
  } catch (error) {
    logger.error({ err: error }, "Error in updating quantities for the cart:");

    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Inventory Update Batch',
      status: 'failure',
      message: `Inventory update batch failed: ${error.message}`,
      order_id: orderId,
      execution_path: 'checkoutService.updateQuantities',
      error_details: error.message
    });

    return [];
  }
}

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

  if (!cartDataId) throw new Error("Missing cartDataId in payment metadata");

  const cartDataEntry = await CartData.findById(cartDataId);
  if (!cartDataEntry) {
    throw new Error("Cart data not found");
  }
  const cartData = cartDataEntry.cartData;

  const formatter = new Intl.NumberFormat("en-US", {
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
    if (coupon && coupon.status !== "used") {
      coupon.status = "used";
      await coupon.save();
      logger.info(`Coupon ${couponCode} status updated to 'used'.`);
    }
  }

  const formatDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
  const formatTime = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dubai",
  });
  const orderDateTime = `${formatDate} - ${formatTime}`;

  const lastOrder = await Order.findOne()
    .sort({ createdAt: -1 })
    .select("order_no");
  let nextOrderNo = 1;
  if (lastOrder && lastOrder.order_no) {
    nextOrderNo = lastOrder.order_no + 1;
  }
  const uniquePart = crypto
    .randomBytes(2)
    .toString("hex")
    .toUpperCase()
    .slice(0, 3);

  const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(
    3,
    "0"
  )}${uniquePart}`;

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
    status: "confirmed",
    payment_method: paymentMethod,
    payment_status: "paid",
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

  if (ENVIRONMENT === "true") {
    try {
      const results = await updateQuantities(cartData);
      console.log("Update results:", results);
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
  const dayOfWeek = deliveryDate.toLocaleString("default", {
    weekday: "long",
  });
  const monthStr = deliveryDate.toLocaleString("default", { month: "long" });
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
    if (!str) return "";
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
    .join("");
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
                                                ${discountAmount > 0 ? `<thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${formattedDiscountAmount}</b></th></tr></thead>` : ""}
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
                                                ${discountAmount > 0 ? `<thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${formattedDiscountAmount}</b></th></tr></thead>` : ""}
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
    status: "Confirmed",
    dateTime: getUaeDateTime(),
    image: null,
  });

  await order.save();

  return order;
}

// ─── Exported Functions ──────────────────────────────────────────

/**
 * Create Stripe checkout session
 */
exports.createStripeCheckout = async (cartData, userId, metadata) => {
  const {
    shippingCost, name, phone, address, currency, city, area,
    buildingName, floorNo, apartmentNo, landmark, discountPercent,
    couponCode, mobileNumber, paymentMethod, discountAmount,
    totalAmount, subTotalAmount, saved_total, bankPromoId, capAED,
  } = metadata;

  const cartDataEntry = await CartData.create({ cartData: cartData });
  const cartDataId = cartDataEntry._id;

  const { discountAED: disc, subtotalBefore } = await resolveCheckoutDiscountAED({
    cartData, bankPromoId, discountPercent, discountAmount, capAED,
  });
  const subtotalAfter = Math.max(0, subtotalBefore - disc);
  const totalBeforeCents = Math.round(subtotalBefore * 100);
  const totalAfterCents = Math.round(subtotalAfter * 100);

  let lineItems;
  if (disc > 0 && subtotalBefore > 0 && totalBeforeCents > 0) {
    let allocatedCents = 0;
    lineItems = cartData.map((item, index) => {
      const lineBeforeCents = Math.round(Number(item.price) * 100) * Number(item.qty);
      let lineAfterCents;
      if (index === cartData.length - 1) {
        lineAfterCents = totalAfterCents - allocatedCents;
      } else {
        lineAfterCents = Math.round(totalAfterCents * (lineBeforeCents / totalBeforeCents));
        allocatedCents += lineAfterCents;
      }
      const qty = Number(item.qty) || 1;
      const unitCents = Math.max(1, Math.round(lineAfterCents / qty));
      return {
        price_data: {
          currency: currency,
          product_data: { name: item.name, description: item.variant || "" },
          unit_amount: unitCents,
        },
        quantity: qty,
      };
    });
  } else {
    lineItems = cartData.map((item) => ({
      price_data: {
        currency: currency,
        product_data: { name: item.name, description: item.variant || "" },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: Number(item.qty),
    }));
  }

  try {
    if (shippingCost) {
      lineItems.push({
        price_data: {
          currency: currency,
          product_data: { name: "Shipping Cost" },
          unit_amount: Math.round(Number(shippingCost) * 100),
        },
        quantity: 1,
      });
    }

    let sessionOptions = {
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/failed`,
      metadata: {
        name, phone, address,
        city: city || '', area: area || '',
        buildingName: buildingName || '',
        floorNo: String(floorNo ?? ''),
        apartmentNo: String(apartmentNo ?? ''),
        landmark: landmark || '',
        totalAmount, subTotalAmount, saved_total,
        shippingCost, currency,
        cartDataId: cartDataId.toString(),
        couponCode: couponCode || '',
        mobileNumber: mobileNumber || '',
        paymentMethod, discountAmount,
        bankPromoId: bankPromoId || '',
      },
    };

    const session = await stripe.checkout.sessions.create(sessionOptions);
    return { id: session.id };
  } catch (error) {
    logger.error({ err: error }, "Error creating checkout session:");
    throw { status: 500, message: "Internal Server Error" };
  }
};

/**
 * Create Tabby checkout session
 */
exports.createTabbyCheckout = async (cartData, userId, metadata) => {
  try {
    const { customerOrderData, orderData, paymentMethod } = metadata;
    const { payment, merchant_urls, merchant_code, lang } = customerOrderData;

    const {
      cartData: tabbyCartData, shippingCost, name, phone, address, currency,
      city, area, buildingName, floorNo, apartmentNo, landmark,
      discountPercent, couponCode, mobileNumber, saved_total,
      bankPromoId, discountAmount, capAED,
    } = orderData;

    const { discountAED: tabbyDisc, subtotalBefore: subtotalAmount } =
      await resolveCheckoutDiscountAED({
        cartData: tabbyCartData, bankPromoId, discountPercent, discountAmount, capAED,
      });

    const tabbyTotalAED = Math.round((subtotalAmount - tabbyDisc + Number(shippingCost || 0)) * 100) / 100;
    payment.amount = String(tabbyTotalAED);
    if (!payment.order) payment.order = {};
    payment.order.discount_amount = tabbyDisc.toFixed(2);
    payment.order.shipping_amount = String(shippingCost || 0);

    const cartDataEntry = await CartData.create({ cartData: tabbyCartData });
    const cartDataId = cartDataEntry._id;

    payment.meta = {
      ...(payment.meta || {}),
      name: String(name), phone: String(phone), address: String(address),
      city: String(city || ""), area: String(area || ""),
      buildingName: String(buildingName || ""),
      floorNo: String(floorNo || ""), apartmentNo: String(apartmentNo || ""),
      landmark: String(landmark || ""),
      subtotalAmount: String(subtotalAmount),
      shippingCost: String(shippingCost || 0), currency: String(currency),
      cartDataId: String(cartDataId),
      couponCode: String(couponCode || ""), mobileNumber: String(mobileNumber || ""),
      paymentMethod: String(paymentMethod),
      discountPercent: String(discountPercent || 0),
      saved_total: String(saved_total || 0),
      bankPromoId: String(bankPromoId || ""),
    };

    const requestBody = {
      payment: {
        amount: String(payment.amount),
        currency: String(payment.currency).toUpperCase(),
        description: String(payment.description),
        buyer: {
          name: String(payment.buyer.name), phone: String(payment.buyer.phone),
          email: String(payment.buyer.email), dob: String(payment.buyer.dob || ""),
        },
        shipping_address: {
          city: String(payment.shipping_address.city),
          address: String(payment.shipping_address.address),
          zip: String(payment.shipping_address.zip || ""),
        },
        order: {
          tax_amount: String(payment.order.tax_amount),
          shipping_amount: String(payment.order.shipping_amount),
          discount_amount: String(payment.order.discount_amount),
          saved_total: String(payment.order.saved_total),
          updated_at: payment.order.updated_at,
          reference_id: String(payment.order.reference_id),
          items: payment.order.items.map((item) => ({
            title: String(item.title), description: String(item.description || ""),
            quantity: Number(item.quantity), unit_price: String(item.unit_price),
            discount_amount: String(item.discount_amount || "0.00"),
            reference_id: String(item.reference_id), image_url: String(item.image_url),
            product_url: String(item.product_url),
            category: String(item.category || "general"),
            brand: String(item.brand || "Your Store Brand"),
            is_refundable: Boolean(item.is_refundable !== false),
            gender: String(item.gender || "Unisex"), color: String(item.color || ""),
            product_material: String(item.product_material || ""),
            size_type: String(item.size_type || ""), size: String(item.size || ""),
          })),
        },
        buyer_history: {
          registered_since: payment.buyer_history.registered_since,
          loyalty_level: Number(payment.buyer_history.loyalty_level || 0),
          wishlist_count: Number(payment.buyer_history.wishlist_count || 0),
          is_social_networks_connected: Boolean(payment.buyer_history.is_social_networks_connected),
          is_phone_number_verified: Boolean(payment.buyer_history.is_phone_number_verified),
          is_email_verified: Boolean(payment.buyer_history.is_email_verified),
        },
        order_history: payment.order_history || [],
        meta: payment.meta,
      },
      lang: String(lang || "en"),
      merchant_code: String(merchant_code),
      merchant_urls: {
        success: String(merchant_urls.success),
        cancel: String(merchant_urls.cancel),
        failure: String(merchant_urls.failure),
      },
    };

    const tabbyResponse = await fetch("https://api.tabby.ai/api/v2/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await tabbyResponse.json();

    if (tabbyResponse.ok) {
      if (data.status === "rejected") {
        const rejectionReason = data.message || data.reason ||
          "Sorry, Tabby is unable to approve this purchase. Please use an alternative payment method for your order.";
        throw { status: 400, message: rejectionReason, data: { status: "rejected" } };
      }

      const installments = data?.configuration?.available_products?.installments || [];
      const checkout_url = installments.length > 0 ? installments[0]?.web_url : null;

      if (checkout_url && data.status === "created") {
        return { checkout_url, status: data.status };
      } else {
        throw { status: 500, message: "No available products in Tabby configuration" };
      }
    } else {
      console.error("Tabby API Error:", { status: tabbyResponse.status, data, sentPayload: requestBody });
      throw { status: tabbyResponse.status, message: data.message || "Failed to create Tabby checkout" };
    }
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Tabby checkout error:");
    throw { status: 500, message: "Internal server error" };
  }
};

/**
 * Verify Stripe payment + create order
 */
exports.verifyStripePayment = async (sessionId, userId) => {
  try {
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Verify Card Payment API Hit',
      status: 'success',
      message: `verifyCardPayment API hit - user: ${userId || 'n/a'}, sessionId: ${sessionId || 'n/a'}`,
      execution_path: 'checkoutService.verifyStripePayment (initial)'
    });

    if (!sessionId) {
      throw { status: 400, message: "Session ID is required" };
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

    const formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

    let formattedshippingCost = 0;
    if (shippingCost) {
      formattedshippingCost = formatter.format(shippingCost);
    } else {
      formattedshippingCost = formatter.format(0);
    }

    if (session.payment_status === "paid") {
      if (couponCode && mobileNumber) {
        const coupon = await Coupon.findOne({ coupon: couponCode, phone: mobileNumber });
        if (coupon) {
          coupon.status = "used";
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
          logger.error({ err: err }, "Error recording bank promo usage:");
        }
      }

      const txn_id = session.payment_intent;
      const payment_status = session.payment_status;
      const stripe_checkout_session_id = session.id;
      const userEmail = session.customer_details.email;

      const formatDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dubai",
      });
      const formatTime = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dubai",
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

      const lastOrder = await Order.findOne().sort({ createdAt: -1 }).select("order_no");
      let nextOrderNo = 1;
      if (lastOrder && lastOrder.order_no) { nextOrderNo = lastOrder.order_no + 1; }

      const uniquePart = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 3);
      const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(3, "0")}${uniquePart}`;

      const orderPayload = {
        userId: userId, order_id: nextOrderId, order_no: nextOrderNo,
        order_datetime: orderDateTime, name, email: userEmail, address,
        state: '-', city: city || '-', area: area || '-',
        buildingName: buildingName || '-', floorNo: floorNo || '-',
        apartmentNo: apartmentNo || '-', landmark: landmark || '-',
        amount_subtotal: subTotalAmount, amount_total: totalAmount,
        discount_amount: discountAmount, phone, status: "confirmed",
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

      if (ENVIRONMENT === "true") {
        try {
          const results = await updateQuantities(cartData, nextOrderId);
          console.log("Update results:", results);
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

      const currentDate = new Date();
      const deliveryDate = new Date(currentDate.getTime() + 3 * 24 * 60 * 60 * 1000);
      const dayNum = deliveryDate.getDate();
      const dayOfWeek = deliveryDate.toLocaleString("default", { weekday: "long" });
      const monthStr = deliveryDate.toLocaleString("default", { month: "long" });
      const formattedDeliveryDate = `${dayOfWeek}, ${dayNum} ${monthStr}`;

      const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
      const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
      const adminEmailAddr = await getAdminEmail();
      const logoUrl = `${WEBURL}/images/logo.png`;

      function toCapitalCase(str) { if (!str) return ""; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); }
      const formattedPaymentMethod = toCapitalCase(paymentMethod);

      const ccEmails = await getCcEmails();

      const purchaseDetails = cartData.map((data) => `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.name}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${data.price}</td>
                </tr>`).join("");

      // Admin and user email HTML templates (same as original - condensed for readability)
      const adminHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0"><table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;"><tr><td><table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td style="height:40px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><a href="https://www.bazaar-uae.com" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Order No:</b> ${nextOrderId}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Date & Time:</b> ${orderDateTime}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p><p style="color: #455056; font-size: 16px; font-weight: bold;"><b>Payment Method:</b> ${formattedPaymentMethod}</p></td></tr><tr><td style="height:30px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>A new order has been placed on Bazaar.</b></p><p style="color: #455056; font-size: 16px;">Below are the order details:</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);"><thead><tr style="background-color: #f8f9fa;"><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th></tr></thead><tbody style="font-size: 14px;">${purchaseDetails}</tbody><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${subTotalAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discountAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${totalAmount}</b></th></tr></thead></table></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 22px; font-weight: 600;">Customer Information</p><br /></td></tr><tr><td><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Name: ${name}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Email: ${userEmail}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">City: ${city || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Area: ${area || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Building Name: ${buildingName || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Floor No: ${floorNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Apartment No: ${apartmentNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Landmark: ${landmark || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Phone: ${phone}</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74);">&copy; <strong>bazaar-uae.com</strong></p></td></tr><tr><td style="height:80px;">&nbsp;</td></tr></table></td></tr></table></body>`;

      const userHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0"><table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;"><tr><td><table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td style="height:40px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><a href="https://www.bazaar-uae.com" title="logo" target="_blank"><img width="110" src="${logoUrl}" title="logo" alt="logo"></a></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Order No:</b> ${nextOrderId}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Date & Time:</b> ${orderDateTime}</p><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>Get it By:</b> ${formattedDeliveryDate}</p><p style="color: #455056; font-size: 16px; font-weight: bold;"><b>Payment Method:</b> ${formattedPaymentMethod}</p></td></tr><tr><td style="height:30px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 16px; font-weight: 600;"><b>${name}</b>! Thank you for your order with Bazaar!</p><p style="color: #455056; font-size: 16px;">We have received your order and are processing it. Below are the details of your purchase</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);"><thead><tr style="background-color: #f8f9fa;"><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th></tr></thead><tbody style="font-size: 14px;">${purchaseDetails}</tbody><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${subTotalAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discountAmount}</b></th></tr></thead><thead><tr style="background-color: #f8f9fa;"><th></th><th></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th><th style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${totalAmount}</b></th></tr></thead></table></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td><p style="color: #455056; font-size: 22px; font-weight: 600;">Billing Details</p><br /></td></tr><tr><td><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Name: ${name}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Customer Email: ${userEmail}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">City: ${city || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Area: ${area || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Building Name: ${buildingName || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Floor No: ${floorNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Apartment No: ${apartmentNo || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Landmark: ${landmark || '-'}</p><p style="color: #455056; font-size: 13px; font-weight: 600;">Phone: ${phone}</p></td></tr><tr><td style="height:20px;">&nbsp;</td></tr><tr><td style="text-align:center;"><p style="font-size:14px; color:rgba(69, 80, 86, 0.74);">&copy; <strong>bazaar-uae.com</strong></p></td></tr><tr><td style="height:80px;">&nbsp;</td></tr></table></td></tr></table></body>`;

      // Send emails
      try {
        await sendEmail(adminEmailAddr, adminSubject, adminHtml, ccEmails);
      } catch (adminEmailError) {
        logger.error({ err: adminEmailError }, "Failed to send admin email:");
      }

      try {
        await sendEmail(userEmail, userSubject, userHtml);
      } catch (userEmailError) {
        logger.error({ err: userEmailError }, "Failed to send user email:");
      }

      await Notification.create({
        userId: userId,
        title: `Order No: ${order.order_id} Placed Successfully`,
        message: `Hi ${name}, your order of AED ${Number(totalAmount).toFixed(2)} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
      });

      await clearUserCart(userId);

      order.orderTracks.push({ status: "Confirmed", dateTime: getUaeDateTime(), image: null });
      await order.save();

      return { message: "Order created successfully", orderId: order._id };
    } else {
      throw { status: 400, message: "Payment not successful." };
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
};

/**
 * Verify Tabby payment + create order
 */
exports.verifyTabbyPayment = async (paymentId, userId, bankPromoId) => {
  try {
    if (!paymentId) {
      throw { status: 400, message: "paymentId is required" };
    }

    const paymentResp = await axios.get(
      `https://api.tabby.ai/api/v2/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
    );
    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();

    if (status === "AUTHORIZED") {
      const captureResp = await axios.post(
        `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
        { amount: payment.amount },
        { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
      );
      if (captureResp.data.status?.toUpperCase() !== "CLOSED") {
        throw { status: 500, message: "Capture failed" };
      }
    }

    const finalStatus = status === "AUTHORIZED" ? "CLOSED" : status;
    if (finalStatus === "CLOSED") {
      const order = await createOrderAndSendEmails(payment, userId);

      if (bankPromoId && userId) {
        try {
          const promo = await BankPromoCode.findById(bankPromoId);
          if (promo) {
            const existing = await BankPromoCodeUsage.findOne({
              bankPromoCodeId: promo._id, userId: userId,
            });
            if (!existing) {
              await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId: userId });
              promo.usageCount = (promo.usageCount || 0) + 1;
              await promo.save();
              logger.info(`Bank promo ${promo.code} usage recorded for user ${userId} (Tabby).`);
            }
          }
        } catch (err) {
          logger.error({ err: err }, "Error recording bank promo usage (Tabby):");
        }
      }

      const currentDate = new Date();
      const deliveryDate = new Date(currentDate.getTime() + 3 * 24 * 60 * 60 * 1000);
      const dayNum = deliveryDate.getDate();
      const dayOfWeek = deliveryDate.toLocaleString("default", { weekday: "long" });
      const monthStr = deliveryDate.toLocaleString("default", { month: "long" });
      const formattedDeliveryDate = `${dayOfWeek}, ${dayNum} ${monthStr}`;

      const orderName = order.name;
      const totalAmount = parseFloat(order.amount_total.replace(/,/g, ''));

      await Notification.create({
        userId: userId,
        title: `Order No: ${order.order_id} Placed Successfully`,
        message: `Hi ${orderName}, your order of AED ${totalAmount.toFixed(2)} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
      });

      return { message: "Order created successfully", orderId: order._id };
    }

    throw { status: 400, message: `Payment status is ${status}` };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Tabby Payment error:");
    throw { status: 500, message: "Internal server error" };
  }
};

/**
 * Legacy checkout (processCheckout)
 */
exports.processCheckout = async (orderData, userId) => {
  try {
    const { name, email, address, cartData, shippingCost, currency } = orderData;

    const amount =
      cartData.reduce((total, item) => total + item.price * item.qty, 0) +
      shippingCost;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency || "usd",
      payment_method_types: ["card"],
    });

    const order = await Order.create({
      name, email, address, amount, shipping: shippingCost,
      payment_status: "pending",
      stripe_checkout_session_id: paymentIntent.id,
      orderfrom: 'Website',
    });

    const orderDetails = cartData.map((item) => ({
      order_id: order._id, product_id: item.id, product_name: item.name,
      variant_name: item.variant, amount: item.price, quantity: item.qty,
    }));

    await OrderDetail.insertMany(orderDetails);

    return { message: "Order created successfully", orderId: order._id };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: error.message };
  }
};

/**
 * Tabby webhook handler
 */
exports.handleTabbyWebhook = async (payload, userId, clientIP, webhookSecret) => {
  try {
    const allowedIPs = process.env.TABBY_IPS.split(",");
    if (!allowedIPs.includes(clientIP)) {
      throw { status: 403, message: "Forbidden IP" };
    }

    if (webhookSecret !== process.env.TABBY_WEBHOOK_SECRET) {
      throw { status: 401, message: "Unauthorized" };
    }

    let data;
    if (Buffer.isBuffer(payload)) {
      data = JSON.parse(payload.toString("utf-8"));
    } else if (typeof payload === "object") {
      data = payload;
    } else {
      throw new Error("Unexpected payload type");
    }

    const { id: paymentId } = data;
    if (!paymentId) throw { status: 400, message: "paymentId missing" };

    const paymentResp = await axios.get(
      `https://api.tabby.ai/api/v2/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
    );
    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();

    if (status === "AUTHORIZED") {
      const captureResp = await axios.post(
        `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
        { amount: payment.amount },
        { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
      );
      if (captureResp.data.status?.toUpperCase() !== "CLOSED") {
        throw { status: 500, message: "Capture failed" };
      }
    }

    const finalStatus = status === "AUTHORIZED" ? "CLOSED" : status;
    if (finalStatus === "CLOSED") {
      await createOrderAndSendEmails(payment, userId);
      return { message: "Order processed" };
    }

    return { message: "Webhook received" };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Tabby webhook error:");
    throw { status: 500, message: "Internal server error" };
  }
};

/**
 * Create Nomod checkout session (website flow)
 */
exports.createNomodCheckout = async (req) => {
  try {
    const userId = req.user?._id;
    const {
      cartData, shippingCost = 0, name, phone, address, currency = 'AED',
      city, area, buildingName, floorNo, apartmentNo, landmark,
      discountPercent, couponCode, mobileNumber, saved_total,
      bankPromoId, discountAmount, capAED, successUrl, failureUrl, cancelledUrl,
    } = req.body;

    if (!cartData || !cartData.length) {
      throw { status: 400, message: 'cartData is required' };
    }

    const { discountAED, subtotalBefore: subtotalAmount } = await resolveCheckoutDiscountAED({
      cartData, bankPromoId, discountPercent, discountAmount, capAED,
    });

    const totalAmount = Math.round((subtotalAmount - discountAED + Number(shippingCost || 0)) * 100) / 100;

    const cartDataEntry = await CartData.create({ cartData });
    const cartDataId = cartDataEntry._id;

    const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || process.env.URL || 'https://bazaar-uae.com';

    const provider = PaymentProviderFactory.create('nomod');
    const checkout = await provider.createCheckout({
      referenceId: `${userId}-${Date.now()}`,
      amount: totalAmount,
      currency,
      discount: discountAED,
      items: cartData.map(item => ({
        name: item.name || 'Product',
        quantity: item.qty || 1,
        price: item.price,
      })),
      shippingCost: Number(shippingCost || 0),
      customer: { name, phone },
      successUrl: successUrl || `${FRONTEND_BASE_URL}/order-success`,
      failureUrl: failureUrl || `${FRONTEND_BASE_URL}/order-failure`,
      cancelledUrl: cancelledUrl || `${FRONTEND_BASE_URL}/cart`,
      metadata: {
        userId: String(userId), cartDataId: String(cartDataId),
        name: String(name || ''), phone: String(phone || ''),
        address: String(address || ''), city: String(city || ''),
        area: String(area || ''), buildingName: String(buildingName || ''),
        floorNo: String(floorNo || ''), apartmentNo: String(apartmentNo || ''),
        landmark: String(landmark || ''), currency: String(currency),
        shippingCost: String(shippingCost || 0),
        subtotalAmount: String(subtotalAmount),
        totalAmount: String(totalAmount),
        discountAmount: String(discountAED),
        couponCode: String(couponCode || ''),
        mobileNumber: String(mobileNumber || ''),
        saved_total: String(saved_total || 0),
        bankPromoId: String(bankPromoId || ''),
      },
    });

    const formatDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dubai" });
    const formatTime = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dubai" });
    const orderTime = `${formatDate} - ${formatTime}`;

    await PendingPayment.create({
      user_id: userId,
      payment_id: checkout.id,
      payment_method: 'nomod',
      order_data: {
        cartData, shippingCost, name, phone, address, city, area,
        buildingName, floorNo, apartmentNo, landmark, currency,
        discountPercent, discountAmount: discountAED, couponCode,
        mobileNumber, saved_total, bankPromoId,
        subtotalAmount, totalAmount, cartDataId: String(cartDataId),
      },
      status: 'pending',
      orderfrom: 'Website',
      orderTime,
    });

    logger.info({ checkoutId: checkout.id, userId }, 'Nomod checkout created (website)');
    return { status: 'created', checkout_url: checkout.redirectUrl };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Nomod createCheckout error:');
    throw { status: 500, message: 'Internal server error' };
  }
};

/**
 * Verify Nomod payment + create order (website flow)
 */
exports.verifyNomodPayment = async (req) => {
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

    const formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

    const formatDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dubai" });
    const formatTime = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dubai" });
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
};
