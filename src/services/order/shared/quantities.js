'use strict';

const axios = require('axios');
const { mapLimit } = require('async');
const Product = require('../../../repositories').products.rawModel();
const { sendEmail } = require('../../../mail/emailService');
const { fetchProductDetails } = require('../adapters/lightspeedClient');
const { logActivity } = require('../../../utilities/activityLogger');
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');

const LS_API_KEY = process.env.API_KEY;
const PRODUCTS_UPDATE = process.env.PRODUCTS_UPDATE;
const WEBURL = process.env.URL;
const INVENTORY_CONCURRENCY = 5;

async function updateQuantities(cartData, orderId = null) {
    try {
        const emailDetails = [];
        const updateResults = await mapLimit(
            cartData,
            INVENTORY_CONCURRENCY,
            async (item) => {
                const updateQty = item.total_qty - item.qty;
                const mongoId = item.product_id || item.id;
                const name = item.name;
                const lightspeedVariantId = item.variantId || item.id;

                let update = false;
                try {
                    // update = await updateQuantity(lightspeedVariantId, updateQty, name, lightspeedVariantId);
                    update = true;
                } catch (lsError) {
                    const qtyMsgThrow = `Local before=${null} | Expected=${updateQty}. Lightspeed API THREW: ${lsError?.message}`;
                    await logActivity({
                        platform: 'Mobile App Backend',
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
                            expected_after: updateQty,
                            qty_sold: item.qty,
                        }
                    });
                    await logBackendActivity({
                        platform: 'Mobile App Backend',
                        activity_name: 'Product Database Update',
                        status: 'failure',
                        message: `Product ${name} - Lightspeed API threw. ${lsError?.message}`,
                        product_id: lightspeedVariantId?.toString?.(),
                        product_name: name,
                        order_id: orderId,
                        execution_path: 'orderController.updateQuantities -> Lightspeed API',
                        error_details: lsError?.message
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

                        const beforeVariant = currentDoc.variantsData?.find(
                            (v) => String(v.id) === String(lightspeedVariantId)
                        );
                        const beforeLocalQty = beforeVariant?.qty ?? null;

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
                        const productStatus = totalQty > 0;
                        updatedEntry = await Product.findByIdAndUpdate(
                            mongoObjectId,
                            {
                                $set: { variantsData, totalQty, status: productStatus },
                                $inc: { sold: qtySold },
                            },
                            { new: true }
                        );
                        if (updatedEntry) {
                            const afterVariant = updatedEntry.variantsData?.find(
                                (v) => String(v.id) === String(lightspeedVariantId)
                            );
                            const afterLocalQty = afterVariant?.qty ?? updateQty;
                            const qtyMsg = `BEFORE: Local=${beforeLocalQty} | AFTER: Local=${afterLocalQty} | Expected=${updateQty} QtySold=${item.qty}`;
                            await logActivity({
                                platform: 'Mobile App Backend',
                                log_type: 'backend_activity',
                                action: 'Inventory Update',
                                status: 'success',
                                message: `Product ${name} updated successfully. ${qtyMsg}`,
                                user: null,
                                details: {
                                    order_id: orderId,
                                    product_id: lightspeedVariantId?.toString?.(),
                                    product_name: name,
                                    qty_before: { local: beforeLocalQty },
                                    qty_after: { local: afterLocalQty },
                                    expected_after: updateQty,
                                    qty_sold: item.qty,
                                    total_before: item.total_qty,
                                }
                            });
                            await logBackendActivity({
                                platform: 'Mobile App Backend',
                                activity_name: 'Product Database Update',
                                status: 'success',
                                message: `Product ${name} updated. ${qtyMsg}`,
                                product_id: lightspeedVariantId?.toString?.(),
                                product_name: name,
                                order_id: orderId,
                                execution_path: 'orderController.updateQuantities -> Product.findOneAndUpdate'
                            });
                        } else {
                            const qtyMsgFail = `BEFORE: Local=${beforeLocalQty} | Expected=${updateQty}. Local DB sync FAILED.`;
                            await logActivity({
                                platform: 'Mobile App Backend',
                                log_type: 'backend_activity',
                                action: 'Inventory Update',
                                status: 'failure',
                                message: `Product ${name} - local DB NOT synced. ${qtyMsgFail}`,
                                user: null,
                                details: {
                                    order_id: orderId,
                                    product_id: lightspeedVariantId?.toString?.(),
                                    product_name: name,
                                    error_details: 'findOneAndUpdate returned null - product may not exist in local DB',
                                    qty_before: { local: beforeLocalQty },
                                    expected_after: updateQty,
                                    qty_sold: item.qty,
                                }
                            });
                            await logBackendActivity({
                                platform: 'Mobile App Backend',
                                activity_name: 'Product Database Update',
                                status: 'failure',
                                message: `Product ${name} - local DB sync failed. ${qtyMsgFail}`,
                                product_id: lightspeedVariantId?.toString?.(),
                                product_name: name,
                                order_id: orderId,
                                execution_path: 'orderController.updateQuantities -> Product.findOneAndUpdate',
                                error_details: qtyMsgFail
                            });
                        }
                    } catch (dbError) {
                        throw dbError;
                    }
                } else {
                    await logActivity({
                        platform: 'Mobile App Backend',
                        log_type: 'backend_activity',
                        action: 'Inventory Update',
                        status: 'failure',
                        message: `Product ${name} - Lightspeed API update returned false. Expected=${updateQty}`,
                        user: null,
                        details: {
                            order_id: orderId,
                            product_id: lightspeedVariantId?.toString?.(),
                            product_name: name,
                            error_details: 'Lightspeed API updateQuantity returned false',
                            expected_after: updateQty,
                            qty_sold: item.qty,
                        }
                    });
                    await logBackendActivity({
                        platform: 'Mobile App Backend',
                        activity_name: 'Product Database Update',
                        status: 'failure',
                        message: `Product ${name} - Lightspeed API update returned false. Expected=${updateQty}`,
                        product_id: lightspeedVariantId?.toString?.(),
                        product_name: name,
                        order_id: orderId,
                        execution_path: 'orderController.updateQuantities -> Lightspeed API',
                        error_details: 'updateQuantity returned false'
                    });
                }

                emailDetails.push({
                    productName: name,
                    variantId: lightspeedVariantId,
                    qtySold: item.qty,
                    qtyRemaining: updateQty,
                    updateStatus: update ? "Successful" : "Failed",
                });

                logger.info({ lightspeedVariantId, name, success: !!update }, `Update for product`);
                return update;
            }
        );

        logger.info({ updateResults }, "All updates completed");
        await updateQuantityMail(emailDetails);

        const successCount = updateResults.filter(r => r === true).length;
        const failureCount = updateResults.filter(r => r === false).length;
        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Inventory Update Batch',
            status: successCount > 0 ? 'success' : 'failure',
            message: `Inventory update completed: ${successCount} success, ${failureCount} failed`,
            order_id: orderId,
            execution_path: 'orderController.updateQuantities'
        });

        return updateResults;
    } catch (error) {
        logger.error({ err: error }, "Error in updating quantities for the cart:");

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Inventory Update Batch',
            status: 'failure',
            message: `Inventory update batch failed: ${error.message}`,
            order_id: orderId,
            execution_path: 'orderController.updateQuantities',
            error_details: error.message
        });

        return [];
    }
}

async function updateQuantity(id, updateQty, productName = null, productId = null) {
    try {
        const productsResponse = await axios.put(
            `${PRODUCTS_UPDATE}/${id}`,
            {
                details: {
                    inventory: [
                        {
                        outlet_id: "06f2e29c-25cb-11ee-ea12-904089a077d7",
                        current_amount: updateQty,
                        },
                    ],
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${LS_API_KEY}`,
                    Accept: "application/json",
                },
            }
        );

        if (productsResponse.status === 200) {
            logger.info(`Successfully updated quantity for product with ID: ${id}`);

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Inventory Update',
                status: 'success',
                message: `Inventory updated for ${productName || 'product'} - Qty: ${updateQty}`,
                product_id: productId ? productId.toString() : id.toString(),
                product_name: productName || `Product ${id}`,
                execution_path: 'orderController.updateQuantity -> Lightspeed API'
            });

            return true;
        } else {
            logger.warn(`Unexpected response status: ${productsResponse.status}`);

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Inventory Update',
                status: 'failure',
                message: `Inventory update failed for ${productName || 'product'}`,
                product_id: productId ? productId.toString() : id.toString(),
                product_name: productName || `Product ${id}`,
                execution_path: 'orderController.updateQuantity -> Lightspeed API',
                error_details: `Unexpected response status: ${productsResponse.status}`
            });

            return false;
        }
    } catch (error) {
        logger.warn({ err: error.response ? error.response.data : error.message }, "Error updating product from Lightspeed");

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Inventory Update',
            status: 'failure',
            message: `Inventory update error for ${productName || 'product'}`,
            product_id: productId ? productId.toString() : id.toString(),
            product_name: productName || `Product ${id}`,
            execution_path: 'orderController.updateQuantity -> Lightspeed API',
            error_details: error.response ? JSON.stringify(error.response.data) : error.message
        });

        return false;
    }
}

async function updateQuantityMail(emailDetails) {
    try {
        const email = process.env.ADMIN_EMAIL;
        const logoUrl = `${WEBURL}/logo.png`;
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
        logger.warn({ err: error.response ? error.response.data : error.message }, "Error sending mail to admin");
        return false;
    }
}

module.exports = { updateQuantities, updateQuantity, updateQuantityMail };
