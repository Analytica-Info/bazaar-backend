'use strict';

/**
 * shared/inventory.js  (checkout variant)
 *
 * updateQuantities + updateQuantityMail extracted from checkoutService (PR-MOD-4).
 *
 * BUG-029: Do NOT merge with src/services/order/shared/inventory.js.
 * The two variants have diverged in logging detail and execution path labels.
 */

const repositories = require('../../../repositories');
const Product = repositories.products.rawModel();

const { getDiagnosticInventory, fetchProductDetails } = require('../../shared/lightspeedClient');
const { sendEmail } = require('../../../mail/emailService');
const { getAdminEmail } = require('../../../utilities/emailHelper');
const { logActivity } = require('../../../utilities/activityLogger');
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');

const WEBURL = process.env.URL;

// ─── Email ────────────────────────────────────────────────────────────────────

async function updateQuantityMail(emailDetails) {
  try {
    const email = await getAdminEmail();
    const logoUrl = `${WEBURL}/images/logo.png`;
    const subject = 'Inventory Update Report - Bazaar';
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
                                                      .join('')}
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
      'Error sending mail to admin:',
      error.response ? error.response.data : error.message
    );
    return false;
  }
}

// ─── Inventory update ─────────────────────────────────────────────────────────

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
          updateStatus: update ? 'Successful' : 'Failed',
        });

        console.log(
          `Update for product ID ${lightspeedVariantId?.toString?.()}, Name ${name} was ${
            update ? 'successful' : 'failed'
          }`
        );
        return update;
      })
    );

    console.log('All updates completed:', updateResults);
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
    logger.error({ err: error }, 'Error in updating quantities for the cart:');

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

module.exports = {
  updateQuantityMail,
  updateQuantities,
};
