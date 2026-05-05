'use strict';

const axios = require('axios');
const { mapLimit } = require('async');
const Product = require('../../../repositories').products.rawModel();
const { logActivity } = require('../../../utilities/activityLogger');
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');

const { INVENTORY_CONCURRENCY } = require('../../../config/constants/business');

const LS_API_KEY = process.env.API_KEY;

module.exports = async function validateInventoryBeforeCheckout(products, user, platform) {
    const platformLabel = platform || 'Website Backend';

    if (!products || !Array.isArray(products) || products.length === 0) {
        await logActivity({
            platform: platformLabel,
            log_type: 'backend_activity',
            action: 'Inventory Validation',
            status: 'failure',
            message: 'Products array is required or empty',
            user: user || {},
            details: { error_details: 'Products array is required', request_returned: true }
        });
        await logBackendActivity({
            platform: platformLabel,
            activity_name: 'Inventory Validation Before Checkout',
            status: 'failure',
            message: 'Products array is required or empty',
            execution_path: 'orderController.validateInventoryBeforeCheckout',
            error_details: 'Products array is required'
        });
        throw {
            status: 400,
            data: {
                success: false,
                message: 'Products array is required',
                isValid: false
            }
        };
    }

    const validationResults = [];
    let allValid = true;

    const validProductIds = products
        .map((p) => p.product_id)
        .filter(Boolean);
    const productDocs = validProductIds.length > 0
        ? await Product.find({ _id: { $in: validProductIds } })
            .select("product.id product.name variantsData")
            .lean()
        : [];
    const productDocMap = Object.fromEntries(
        productDocs.map((p) => [String(p._id), p])
    );

    const itemResults = await mapLimit(products, INVENTORY_CONCURRENCY, async (item) => {
        const productId = item.product_id;
        const requestedQty = item.qty;

        if (!productId || !requestedQty) {
            return {
                productId: productId || 'unknown',
                productName: 'Unknown',
                isValid: false,
                message: 'Missing required fields (product_id or qty)',
                dbIndex: null
            };
        }

        let variantId = null;
        let productName = 'Unknown';
        let productDoc = null;

        try {
            productDoc = productDocMap[String(productId)] || null;
            if (!productDoc) {
                return {
                    productId,
                    productName: 'Unknown',
                    isValid: false,
                    message: 'Product not found in database',
                    dbIndex: 'local'
                };
            }

            productName = productDoc.product?.name || 'Unknown';

            if (productDoc.variantsData && productDoc.variantsData.length > 0) {
                variantId = productDoc.variantsData[0].id;
            } else {
                variantId = productDoc.product?.id || null;
            }

            if (!variantId) {
                return {
                    productId,
                    productName,
                    isValid: false,
                    message: 'Variant ID not found for product',
                    dbIndex: 'local'
                };
            }
        } catch (error) {
            logger.error({ err: error }, 'validateInventoryBeforeCheckout: error finding product in MongoDB');
            return {
                productId,
                productName: 'Unknown',
                isValid: false,
                message: 'Error finding product in database',
                dbIndex: 'local'
            };
        }

        let localMongoQty = 0;
        let localMongoValid = false;
        try {
            if (productDoc && productDoc.variantsData) {
                const variant = productDoc.variantsData.find(v => v.id === variantId);
                if (variant) {
                    localMongoQty = variant.qty || 0;
                    localMongoValid = localMongoQty >= requestedQty;
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'validateInventoryBeforeCheckout: error checking local MongoDB');
        }

        let lightspeedQty = 0;
        let lightspeedValid = false;
        let lightspeedApiError = null;
        try {
            logger.debug({ productId, variantId }, 'validateInventoryBeforeCheckout: fetching Lightspeed inventory');
            const inventoryResponse = await axios.get(
                `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
                {
                    headers: {
                        Authorization: `Bearer ${LS_API_KEY}`,
                        Accept: "application/json",
                    },
                }
            );
            lightspeedQty = inventoryResponse.data.data?.[0]?.inventory_level || 0;
            lightspeedValid = lightspeedQty >= requestedQty;
            logger.debug({ productId, variantId, lightspeedQty, requestedQty }, 'validateInventoryBeforeCheckout: inventory fetched');
        } catch (error) {
            logger.error({ productId, variantId, err: error.message }, 'validateInventoryBeforeCheckout: Lightspeed API error');
            lightspeedApiError = {
                message: error.message,
                responseStatus: error.response?.status,
                responseData: error.response?.data || null,
            };
        }

        let dbIndex = null;
        let isValid = false;
        let message = '';

        if (localMongoValid && lightspeedValid) {
            isValid = true;
            message = 'Quantity available';
        } else if (!localMongoValid && !lightspeedValid) {
            message = `Insufficient quantity. Available: ${Math.min(localMongoQty, lightspeedQty)}, Requested: ${requestedQty}`;
            dbIndex = 'both';
        } else if (!localMongoValid) {
            message = `Insufficient quantity in local database. Available: ${localMongoQty}, Requested: ${requestedQty}`;
            dbIndex = 'local';
        } else {
            message = `Insufficient quantity in Lightspeed database. Available: ${lightspeedQty}, Requested: ${requestedQty}`;
            dbIndex = 'lightspeed';
        }

        return {
            productId,
            variantId,
            productName,
            requestedQty,
            localMongoQty,
            lightspeedQty,
            isValid,
            message,
            dbIndex: dbIndex || null,
            lightspeedApiError: lightspeedApiError || undefined
        };
    });

    for (const result of itemResults) {
        validationResults.push(result);
        if (!result.isValid) allValid = false;
    }

    if (allValid) {
        return {
            success: true,
            isValid: true,
            message: 'All items have sufficient quantity',
            results: validationResults
        };
    } else {
        const failedResults = validationResults.filter(r => !r.isValid);
        const lightspeedApiIssues = failedResults.filter(r => r.lightspeedApiError).map(r => ({
            productId: r.productId,
            variantId: r.variantId,
            productName: r.productName,
            lightspeedApiError: r.lightspeedApiError
        }));
        const logDetails = {
            validationResults: failedResults,
            request_returned: true,
            response_status: 400
        };
        if (lightspeedApiIssues.length > 0) {
            logDetails.lightspeed_api_issues = lightspeedApiIssues;
            logDetails.lightspeed_response_messages = lightspeedApiIssues.map(i => ({
                productId: i.productId,
                message: i.lightspeedApiError?.message,
                responseStatus: i.lightspeedApiError?.responseStatus,
                responseData: i.lightspeedApiError?.responseData
            }));
        }
        await logActivity({
            platform: platformLabel,
            log_type: 'backend_activity',
            action: 'Inventory Validation',
            status: 'failure',
            message: `Some items have insufficient quantity. ${lightspeedApiIssues.length > 0 ? 'Lightspeed API issues: ' + JSON.stringify(lightspeedApiIssues) : ''}`,
            user: user || {},
            details: logDetails
        });
        await logBackendActivity({
            platform: platformLabel,
            activity_name: 'Inventory Validation Before Checkout',
            status: 'failure',
            message: `Validation failed: ${failedResults.length} item(s) insufficient. ${lightspeedApiIssues.length > 0 ? 'Lightspeed API errors: ' + lightspeedApiIssues.map(i => i.lightspeedApiError?.message).join('; ') : ''}`,
            execution_path: 'orderController.validateInventoryBeforeCheckout',
            error_details: lightspeedApiIssues.length > 0
                ? `Lightspeed API issues: ${JSON.stringify(lightspeedApiIssues.map(i => i.lightspeedApiError))}`
                : `Validation failed: ${JSON.stringify(failedResults.map(r => ({ productId: r.productId, message: r.message })))}`
        });
        const outOfStock = failedResults.filter(r => !r.lightspeedApiError);
        const apiErrored = failedResults.filter(r => r.lightspeedApiError);
        let topMessage;
        if (apiErrored.length > 0 && outOfStock.length === 0) {
            topMessage = 'Unable to verify stock for some items. Please try again.';
        } else {
            const names = outOfStock.map(r => r.productName || 'an item');
            topMessage = names.length === 1
                ? `"${names[0]}" is out of stock. Please remove it from your cart to continue.`
                : `${names.length} items are out of stock: ${names.join(', ')}. Please remove them from your cart to continue.`;
        }
        throw {
            status: 400,
            data: {
                success: false,
                isValid: false,
                message: topMessage,
                outOfStockProductIds: outOfStock.map(r => r.productId),
                results: validationResults
            }
        };
    }
};
