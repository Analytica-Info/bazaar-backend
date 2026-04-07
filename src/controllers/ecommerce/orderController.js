const User = require("../../models/User");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const axios = require("axios");
const path = require("path");
require("dotenv").config();
const { logActivity } = require("../../utilities/activityLogger");
const { logBackendActivity } = require("../../utilities/backendLogger");
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.gif', '.webp'];
const ALLOWED_IMAGE_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const API_KEY = process.env.API_KEY;

exports.storeAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { _id, name,email, city, area, floorNo, apartmentNo, landmark, buildingName, mobile } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (_id) {
            const addressIndex = user.address.findIndex(addr => addr._id.toString() === _id);
            if (addressIndex === -1) {
                return res.status(404).json({ success: false, message: "Address not found" });
            }

            user.address[addressIndex] = {
                ...user.address[addressIndex].toObject(),
                name,
                city,
                email,
                area,
                floorNo,
                apartmentNo,
                landmark,
                buildingName,
                mobile
            };
        } else {
            user.address.push({
                name,
                city,
                email,
                area,
                floorNo,
                apartmentNo,
                landmark,
                buildingName,
                mobile,
                isPrimary: user.address.length === 0
            });
        }
        user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));

        await user.save();

        res.status(200).json({
            success: true,
            message: _id ? "Address updated successfully" : "Address added successfully",
            addresses: user.address
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const addressIndex = user.address.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        user.address.splice(addressIndex, 1);
        await user.save();

        res.status(200).json({
            success: true,
            message: "Address deleted successfully",
            addresses: user.address
        });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.setPrimaryAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const addressIndex = user.address.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        user.address.forEach(addr => {
            addr.isPrimary = false;
        });

        user.address[addressIndex].isPrimary = true;
        user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));

        await user.save();

        res.status(200).json({
            success: true,
            message: "Primary address set successfully",
            addresses: user.address
        });
    } catch (error) {
        console.error("Error setting primary address:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.address = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('address');

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found", flag: false });
        }

        const hasAddress = user.address && user.address.length > 0;

        res.status(200).json({
            success: true,
            flag: hasAddress,
            address: user.address
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
            flag: false
        });
    }
};

exports.validateInventoryBeforeCheckout = async (req, res) => {
    try {
        const { products } = req.body;

        if (!products || !Array.isArray(products) || products.length === 0) {
            const user = req.user || {};
            await logActivity({
                platform: 'Website Backend',
                log_type: 'backend_activity',
                action: 'Inventory Validation',
                status: 'failure',
                message: 'Products array is required or empty',
                user,
                details: { error_details: 'Products array is required', request_returned: true }
            });
            await logBackendActivity({
                platform: 'Website Backend',
                activity_name: 'Inventory Validation Before Checkout',
                status: 'failure',
                message: 'Products array is required or empty',
                execution_path: 'orderController.validateInventoryBeforeCheckout',
                error_details: 'Products array is required'
            });
            return res.status(400).json({
                success: false,
                message: 'Products array is required',
                isValid: false
            });
        }

        const validationResults = [];
        let allValid = true;

        for (const item of products) {
            const productId = item.product_id;
            const requestedQty = item.qty;

            if (!productId || !requestedQty) {
                validationResults.push({
                    productId: productId || 'unknown',
                    productName: 'Unknown',
                    isValid: false,
                    message: 'Missing required fields (product_id or qty)',
                    dbIndex: null
                });
                allValid = false;
                continue;
            }

            let variantId = null;
            let productName = 'Unknown';
            let productDoc = null;

            try {
                productDoc = await Product.findOne({ _id: productId });
                if (!productDoc) {
                    validationResults.push({
                        productId,
                        productName: 'Unknown',
                        isValid: false,
                        message: 'Product not found in database',
                        dbIndex: 'local'
                    });
                    allValid = false;
                    continue;
                }

                productName = productDoc.product?.name || 'Unknown';
                
                if (productDoc.variantsData && productDoc.variantsData.length > 0) {
                    variantId = productDoc.variantsData[0].id;
                } else {
                    variantId = productDoc.product?.id || null;
                }

                if (!variantId) {
                    validationResults.push({
                        productId,
                        productName,
                        isValid: false,
                        message: 'Variant ID not found for product',
                        dbIndex: 'local'
                    });
                    allValid = false;
                    continue;
                }
            } catch (error) {
                console.error('Error finding product in MongoDB:', error);
                validationResults.push({
                    productId,
                    productName: 'Unknown',
                    isValid: false,
                    message: 'Error finding product in database',
                    dbIndex: 'local'
                });
                allValid = false;
                continue;
            }

            let localMongoQty = 0;
            let localMongoValid = false;
            try {
                if (productDoc && productDoc.variantsData) {
                    const variant = productDoc.variantsData.find(v => v.id === variantId);
                    if (variant) {
                        localMongoQty = variant.qty || 0;
                        localMongoValid = localMongoQty >= requestedQty;
                    } else {
                        localMongoQty = 0;
                        localMongoValid = false;
                    }
                } else {
                    localMongoQty = 0;
                    localMongoValid = false;
                }
            } catch (error) {
                console.error('Error checking local MongoDB:', error);
                localMongoQty = 0;
                localMongoValid = false;
            }

            let lightspeedQty = 0;
            let lightspeedValid = false;
            let lightspeedApiError = null;
            try {
                const inventoryResponse = await axios.get(
                    `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
                    {
                        headers: {
                            Authorization: `Bearer ${API_KEY}`,
                            Accept: "application/json",
                        },
                    }
                );
                lightspeedQty = inventoryResponse.data.data?.[0]?.inventory_level || 0;
                lightspeedValid = lightspeedQty >= requestedQty;
            } catch (error) {
                console.error('Error checking Lightspeed API:', error);
                lightspeedQty = 0;
                lightspeedValid = false;
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
                dbIndex = null;
            } else if (!localMongoValid && !lightspeedValid) {
                isValid = false;
                message = `Insufficient quantity. Available: ${Math.min(localMongoQty, lightspeedQty)}, Requested: ${requestedQty}`;
                dbIndex = 'both';
            } else if (!localMongoValid) {
                isValid = false;
                message = `Insufficient quantity in local database. Available: ${localMongoQty}, Requested: ${requestedQty}`;
                dbIndex = 'local';
            } else if (!lightspeedValid) {
                isValid = false;
                message = `Insufficient quantity in Lightspeed database. Available: ${lightspeedQty}, Requested: ${requestedQty}`;
                dbIndex = 'lightspeed';
            }

            validationResults.push({
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
            });

            if (!isValid) {
                allValid = false;
            }
        }

        if (allValid) {
            return res.status(200).json({
                success: true,
                isValid: true,
                message: 'All items have sufficient quantity',
                results: validationResults
            });
        } else {
            const failedResults = validationResults.filter(r => !r.isValid);
            const lightspeedApiIssues = failedResults.filter(r => r.lightspeedApiError).map(r => ({
                productId: r.productId,
                variantId: r.variantId,
                productName: r.productName,
                lightspeedApiError: r.lightspeedApiError
            }));
            const user = req.user || {};
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
                platform: 'Website Backend',
                log_type: 'backend_activity',
                action: 'Inventory Validation',
                status: 'failure',
                message: `Some items have insufficient quantity. ${lightspeedApiIssues.length > 0 ? 'Lightspeed API issues: ' + JSON.stringify(lightspeedApiIssues) : ''}`,
                user,
                details: logDetails
            });
            await logBackendActivity({
                platform: 'Website Backend',
                activity_name: 'Inventory Validation Before Checkout',
                status: 'failure',
                message: `Validation failed: ${failedResults.length} item(s) insufficient. ${lightspeedApiIssues.length > 0 ? 'Lightspeed API errors: ' + lightspeedApiIssues.map(i => i.lightspeedApiError?.message).join('; ') : ''}`,
                execution_path: 'orderController.validateInventoryBeforeCheckout',
                error_details: lightspeedApiIssues.length > 0
                    ? `Lightspeed API issues: ${JSON.stringify(lightspeedApiIssues.map(i => i.lightspeedApiError))}`
                    : `Validation failed: ${JSON.stringify(failedResults.map(r => ({ productId: r.productId, message: r.message })))}`
            });
            return res.status(400).json({
                success: false,
                isValid: false,
                message: 'Some items have insufficient quantity',
                results: validationResults
            });
        }

    } catch (error) {
        console.error('Error validating inventory:', error);
        const user = req.user || {};
        await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Validation',
            status: 'failure',
            message: `Internal server error: ${error.message}`,
            user,
            details: {
                error_details: error.message,
                stack: error.stack,
                request_returned: true,
                response_status: 500
            }
        });
        await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Inventory Validation Before Checkout',
            status: 'failure',
            message: `Internal server error: ${error.message}`,
            execution_path: 'orderController.validateInventoryBeforeCheckout',
            error_details: error.message
        });
        return res.status(500).json({
            success: false,
            isValid: false,
            message: 'Internal server error while validating inventory',
            error: error.message
        });
    }
};

exports.uploadProofOfDelivery = async (req, res) => {
    try {
        const order_id = req.body.order_id;
        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: 'order_id is required',
            });
        }

        const order = await Order.findOne({ order_id }).exec();
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        let proof_of_delivery = [];

        if (req.files && req.files.length > 0) {
            const ext = (file) => path.extname(file.originalname || '').toLowerCase();
            const isImage = (file) =>
                ALLOWED_IMAGE_EXTENSIONS.includes(ext(file)) &&
                ALLOWED_IMAGE_MIMETYPES.includes((file.mimetype || '').toLowerCase());
            const invalid = req.files.find((f) => !isImage(f));
            if (invalid) {
                return res.status(400).json({
                    success: false,
                    message: 'Only image files are allowed (png, jpeg, jpg, gif, webp).',
                });
            }
            const BACKEND_URL = process.env.BACKEND_URL || '';
            proof_of_delivery = req.files.map((file) => `${BACKEND_URL}/uploads/proof-of-delivery/${file.filename}`);
        } else {
            const bodyProof = req.body.proof_of_delivery;
            if (bodyProof != null) {
                if (Array.isArray(bodyProof)) proof_of_delivery = bodyProof;
                else if (typeof bodyProof === 'string') {
                    try { proof_of_delivery = JSON.parse(bodyProof); } catch { proof_of_delivery = [bodyProof]; }
                } else proof_of_delivery = [];
            }
        }

        if (proof_of_delivery.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one proof of delivery image or URL is required.',
            });
        }

        const previousImages = order.proof_of_delivery || [];
        order.proof_of_delivery = proof_of_delivery;
        await order.save();

        const message = previousImages.length > 0
            ? 'Proof of delivery updated (replaced previous images).'
            : 'Proof of delivery saved.';

        return res.status(200).json({
            success: true,
            message,
            order_id: order.order_id,
            proof_of_delivery: order.proof_of_delivery,
        });
    } catch (error) {
        console.error('uploadProofOfDelivery error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to save proof of delivery',
        });
    }
};