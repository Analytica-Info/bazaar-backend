const CartData = require("../models/CartData");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Coupon = require("../models/Coupons");
const User = require("../models/User");
const OrderDetail = require("../models/OrderDetail");
const Product = require("../models/Product");
const stripe = require("stripe")(process.env.STRIPE_SK);
const crypto = require("crypto");
const { sendEmail } = require("../mail/emailService");
require("dotenv").config();
const axios = require('axios');
const path = require("path");
const fs = require("fs");
const API_KEY = process.env.STRIPE_SK;
const LS_API_KEY = process.env.API_KEY;
const ENVIRONMENT = process.env.ENVIRONMENT;
const TABBY_AUTH_KEY = process.env.TABBY_AUTH_KEY;
const TABBY_SECRET_KEY = process.env.TABBY_SECRET_KEY;
const { sendPushNotification } = require('../helpers/sendPushNotification');
const PendingPayment = require('../models/PendingPayment');
const WEBURL = process.env.URL;
const PRODUCTS_UPDATE = process.env.PRODUCTS_UPDATE;
const { logActivity } = require('../utilities/activityLogger');
const { logBackendActivity } = require('../utilities/backendLogger');

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.gif', '.webp'];
const ALLOWED_IMAGE_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

const GIFT_MIN_STOCK = 5;
const giftProductQuery = {
    isGift: true,
    $or: [
        { status: { $exists: false } },
        { status: true }
    ],
};

// ==================== Address Management (shared) ====================

exports.getAddresses = async (userId) => {
    const user = await User.findById(userId).select('address');

    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    const hasAddress = user.address && user.address.length > 0;

    return {
        flag: hasAddress,
        address: user.address
    };
};

exports.storeAddress = async (userId, addressData) => {
    const { _id, name, email, city, area, floorNo, apartmentNo, landmark, buildingName, mobile, state } = addressData;

    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    if (_id) {
        const addressIndex = user.address.findIndex(addr => addr._id.toString() === _id);
        if (addressIndex === -1) {
            throw { status: 404, message: "Address not found" };
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
            mobile,
            state
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
            state,
            isPrimary: user.address.length === 0
        });
    }
    user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));

    await user.save();

    return {
        message: _id ? "Address updated successfully" : "Address added successfully",
        addresses: user.address
    };
};

exports.deleteAddress = async (userId, addressId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    const addressIndex = user.address.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
        throw { status: 404, message: "Address not found" };
    }

    user.address.splice(addressIndex, 1);
    await user.save();

    return {
        addresses: user.address
    };
};

exports.setPrimaryAddress = async (userId, addressId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    const addressIndex = user.address.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
        throw { status: 404, message: "Address not found" };
    }

    user.address.forEach(addr => {
        addr.isPrimary = false;
    });

    user.address[addressIndex].isPrimary = true;
    user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));

    await user.save();

    return {
        addresses: user.address
    };
};

// ==================== Order Operations ====================

exports.validateInventoryBeforeCheckout = async (products, user, platform) => {
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
                        Authorization: `Bearer ${LS_API_KEY}`,
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
        throw {
            status: 400,
            data: {
                success: false,
                isValid: false,
                message: 'Some items have insufficient quantity',
                results: validationResults
            }
        };
    }
};

exports.getOrders = async (userId) => {
    const orders = await Order.find({
        $or: [
            { userId: userId },
            { user_id: userId }
        ]
    });
    const orderIds = orders.map(order => order._id);
    const orderDetails = await OrderDetail.find({ order_id: { $in: orderIds } });

    const productIds = [...new Set(orderDetails.map(detail => detail.product_id))];

    const products = await Product.find({ _id: { $in: productIds } });
    const productsMap = {};
    products.forEach(product => {
        productsMap[product._id.toString()] = product;
    });

    const detailsMap = {};
    orderDetails.forEach(detail => {
        const key = detail.order_id.toString();
        if (!detailsMap[key]) detailsMap[key] = [];

        const detailObj = detail.toObject();
        const product = productsMap[detail.product_id];

        if (product) {
            detailObj.ProductId = product.product?.id || null;
        }

        detailsMap[key].push(detailObj);
    });

    const ordersWithDetails = orders.map(order => {
        const orderObj = order.toObject();

        if (orderObj.userId) {
            orderObj.user_id = orderObj.userId;
            delete orderObj.userId;
        }

        if (orderObj.checkout_session_id) {
            orderObj.stripe_checkout_session_id = orderObj.checkout_session_id;
            delete orderObj.checkout_session_id;
        }

        orderObj.details = detailsMap[order._id.toString()] || [];
        return orderObj;
    });

    return ordersWithDetails;
};

exports.getPaymentIntent = async () => {
    const paymentIntentId = 'pi_3RVUm3Ga9aBXxV9x0vKrp7qq';
    const response = await axios.get(
        `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                Accept: 'application/json',
            },
        }
    );

    return response.data;
};

exports.updateOrderStatus = async (orderId, status, filePath) => {
    if (!status) {
        throw { status: 400, message: "Status is required" };
    }

    const allowedStatuses = [
        "Packed",
        "On The Way",
        "Arrived At Facility",
        "Out For Delivery",
        "Delivered",
        "Confirmed"
    ];

    if (!allowedStatuses.includes(status)) {
        throw {
            status: 400,
            message: `Invalid status. Allowed statuses are: ${allowedStatuses.join(", ")}`
        };
    }

    const order = await Order.findById(orderId);
    if (!order) {
        throw { status: 404, message: "Order not found" };
    }

    let imagePath = null;
    if (filePath) {
        imagePath = filePath.replace(/\\/g, "/");
        imagePath = `${process.env.FRONTEND_BASE_URL}/${imagePath}`;
    }

    order.status = status;

    order.orderTracks.push({
        status,
        dateTime: new Date(),
        image: imagePath
    });

    await order.save();

    return order;
};

exports.uploadProofOfDelivery = async (orderId, files, bodyProof) => {
    if (!orderId) {
        throw { status: 400, message: 'order_id is required' };
    }

    const order = await Order.findOne({ order_id: orderId }).exec();
    if (!order) {
        throw { status: 404, message: 'Order not found' };
    }

    let proof_of_delivery = [];

    if (files && files.length > 0) {
        const ext = (file) => path.extname(file.originalname || '').toLowerCase();
        const isImage = (file) =>
            ALLOWED_IMAGE_EXTENSIONS.includes(ext(file)) &&
            ALLOWED_IMAGE_MIMETYPES.includes((file.mimetype || '').toLowerCase());
        const invalid = files.find((f) => !isImage(f));
        if (invalid) {
            throw { status: 400, message: 'Only image files are allowed (png, jpeg, jpg, gif, webp).' };
        }
        const BACKEND_URL = process.env.BACKEND_URL || '';
        proof_of_delivery = files.map((file) => `${BACKEND_URL}/uploads/proof-of-delivery/${file.filename}`);
    } else {
        if (bodyProof != null) {
            if (Array.isArray(bodyProof)) proof_of_delivery = bodyProof;
            else if (typeof bodyProof === 'string') {
                try { proof_of_delivery = JSON.parse(bodyProof); } catch { proof_of_delivery = [bodyProof]; }
            } else proof_of_delivery = [];
        }
    }

    if (proof_of_delivery.length === 0) {
        throw { status: 400, message: 'At least one proof of delivery image or URL is required.' };
    }

    const previousImages = order.proof_of_delivery || [];
    order.proof_of_delivery = proof_of_delivery;
    await order.save();

    const message = previousImages.length > 0
        ? 'Proof of delivery updated (replaced previous images).'
        : 'Proof of delivery saved.';

    return {
        message,
        order_id: order.order_id,
        proof_of_delivery: order.proof_of_delivery,
    };
};

// ==================== Mobile Checkout ====================

function normalizeCartDataWithGifts(cartData) {
    let normalizedCartData = Array.isArray(cartData) ? [...cartData] : [];
    return normalizedCartData;
}

async function applyGiftLogic(normalizedCartData) {
    const giftIndices = normalizedCartData
        .map((item, index) => (item && item.isGiftWithPurchase ? index : -1))
        .filter((i) => i >= 0);
    if (giftIndices.length > 0) {
        const giftProduct = await Product.findOne(giftProductQuery)
            .select("totalQty")
            .lean();
        const giftStock = giftProduct?.totalQty ?? 0;
        if (giftStock <= GIFT_MIN_STOCK || giftStock <= 0) {
            normalizedCartData = normalizedCartData.filter((item) => !item.isGiftWithPurchase);
        } else {
            let firstGiftKept = false;
            normalizedCartData = normalizedCartData.filter((item) => {
                if (!item.isGiftWithPurchase) return true;
                if (!firstGiftKept) {
                    firstGiftKept = true;
                    item.price = 0;
                    item.amount = 0;
                    return true;
                }
                return false;
            });
        }
    }
    return normalizedCartData;
}

exports.createStripeCheckoutSession = async (userId, bodyData, metadata) => {
    const {
        cartData,
        shippingCost,
        name,
        phone,
        address,
        state,
        city,
        area,
        floorNo,
        buildingName,
        apartmentNo,
        landmark,
        currency,
        discountPercent,
        discountAmount,
        couponCode,
        payment_method,
        mobileNumber,
        paymentIntentId,
        txnId,
        paymentStatus,
        user_email,
        total,
        sub_total,
    } = bodyData;
    const user_id = userId;
    const fcmToken = metadata?.fcmToken || null;

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Checkout Session API Hit',
        status: 'success',
        message: `Stripe checkoutSession API hit - user: ${user_id || 'n/a'}, email: ${user_email || 'n/a'}, payment_method: ${payment_method || 'n/a'}. Order data: cartData, shippingCost, name, phone, address, state, city, area, floorNo, buildingName, apartmentNo, landmark, currency, discountPercent, discountAmount, couponCode, mobileNumber, user_email, total, sub_total, txnId, paymentStatus, fcmToken`,
        execution_path: 'orderController.checkoutSession (initial)'
    });

    let normalizedCartData = normalizeCartDataWithGifts(cartData);
    normalizedCartData = await applyGiftLogic(normalizedCartData);
    const cartDataToUse = normalizedCartData;

    if (payment_method === 'stripe') {
        if (!paymentIntentId) {
            throw { status: 400, message: 'paymentIntentId is required' };
        }

        const formatDate = new Date().toLocaleDateString("en-GB", {
            day: "numeric",
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

        const orderTime = `${formatDate}, ${formatTime}`;

        const pendingPayment = new PendingPayment({
            user_id: user_id,
            payment_id: paymentIntentId,
            payment_method: 'stripe',
            order_data: {
                cartData: cartDataToUse,
                shippingCost,
                name,
                phone,
                address,
                state,
                city,
                area,
                floorNo,
                buildingName,
                apartmentNo,
                landmark,
                currency,
                discountPercent,
                discountAmount,
                couponCode,
                mobileNumber,
                user_email,
                total,
                sub_total,
                txnId,
                paymentStatus,
                fcmToken
            },
            status: 'pending',
            orderfrom: 'Mobile App',
            orderTime: orderTime
        });

        await pendingPayment.save();
    }

    if (payment_method === 'tabby') {
        const data = await verifyTabbyPayment(paymentIntentId);
        if (data.status !== true) {
            throw { status: 400, message: `Payment verification failed. Status: ${data.finalStatus || data.status}` };
        }
    }

    const cartDataEntryValue = await CartData.create({ cartData: cartDataToUse });
    const cartDataId = cartDataEntryValue._id;

    const cartDataEntry = await CartData.findById(cartDataId);
    const cartDataValue = cartDataEntry.cartData;

    const formatter = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    let formattedshippingCost = 0;
    if(shippingCost) {
        formattedshippingCost = formatter.format(shippingCost);
    } else {
        formattedshippingCost = formatter.format(0);
    }

    const txn_id = txnId;
    const payment_status = paymentStatus;
    const stripe_checkout_session_id = paymentIntentId;
    const userEmail = user_email;
    const amount_subtotal = sub_total;
    const amount_total = total;

    const subtotalInDollars = amount_subtotal;
    const totalInDollars = amount_total;

    const db_subtotal_amount = subtotalInDollars.toFixed(2);
    const db_total_amount = totalInDollars.toFixed(2);

    const formatted_subtotal_amount = formatter.format(subtotalInDollars);
    const formatted_total_amount = formatter.format(totalInDollars);

    const discount_amount_long = Number(discountAmount);
    const discount_amount = formatter.format(discount_amount_long);

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

    const lastOrder = await Order.findOne().sort({ order_no: -1 }).select("order_no");

    let nextOrderNo = 1;
    if(lastOrder && lastOrder.order_no) {
        nextOrderNo = lastOrder.order_no + 1;
    }

    const year = new Date().getFullYear();
    const uniquePart = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 3);

    const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(
        3,
        "0"
    )}${uniquePart}`;

    const order = await Order.create({
        user_id,
        order_id: nextOrderId,
        order_no: nextOrderNo,
        order_datetime: orderDateTime,
        name,
        email: userEmail,
        address,
        state,
        city: city || '-',
        area: area || '-',
        floorNo: floorNo || '-',
        buildingName: buildingName || '-',
        apartmentNo: apartmentNo || '-',
        landmark: landmark != null ? String(landmark) : '-',
        amount_subtotal: db_subtotal_amount,
        amount_total: db_total_amount,
        discount_amount,
        phone,
        shipping: shippingCost,
        txn_id: txn_id,
        status: 'confirmed',
        payment_status: payment_status,
        stripe_checkout_session_id: stripe_checkout_session_id,
        payment_method: payment_method,
        orderfrom: 'Mobile App',
    });

    order.orderTracks.push({
        status: "Confirmed",
        dateTime: new Date(),
        image: null,
    });

    await order.save();

    const user = await User.findById(user_id);
    await logActivity({
        platform: 'Mobile App Backend',
        log_type: 'backend_activity',
        action: 'Order Creation',
        status: 'success',
        message: `Order ${nextOrderId} created successfully`,
        user: user || { _id: user_id, name, email: userEmail },
        details: { order_id: nextOrderId }
    });

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Order Creation',
        status: 'success',
        message: `Order ${nextOrderId} created successfully`,
        order_id: nextOrderId,
        execution_path: 'orderController.checkoutSession -> Order.create'
    });

    if (couponCode && phone) {
        const coupon = await Coupon.findOneAndUpdate(
            {
                coupon: couponCode,
                phone: phone,
                status: "unused"
            },
            {
                status: "used"
            },
            {
                new: true
            }
        );

        if (coupon) {
            console.log(`Coupon ${couponCode} status updated to 'used' after order creation.`);
        } else {
            console.log(
                `Coupon ${couponCode} not found, already used, or does not match the mobile number.`
            );
        }
    }

    if (couponCode === 'FIRST15') {
        const user = await User.findById(user_id);
        if (user) {
            user.usedFirst15Coupon = true;
            await user.save();
            console.log(`FIRST15 coupon marked as used for user: ${user_id} after order creation.`);
        }
    }

    if (couponCode === 'UAE10') {
        const user = await User.findById(user_id);
        if (user && !user.usedUAE10Coupon) {
            user.usedUAE10Coupon = true;
            await user.save();
            console.log(`UAE10 coupon marked as used for user: ${user_id} after order creation.`);
        }
    }

    const orderDetails = cartDataValue.map((item) => {
        const isGift = !!item.isGiftWithPurchase;
        const amount = isGift ? 0 : (Number(item.price) || 0);
        return {
            order_id: order._id,
            product_id: item.id || item.product_id,
            productId: item.product_id || item.id,
            product_name: item.name,
            product_image: item.image,
            variant_name: item.variant,
            amount,
            quantity: item.qty,
            isGiftWithPurchase: isGift,
            nonReturnable: isGift,
        };
    });

    await OrderDetail.insertMany(orderDetails);

    console.log("ENVIRONMENT", ENVIRONMENT);

    if (ENVIRONMENT === "true") {
        try {
            const results = await updateQuantities(cartDataToUse, nextOrderId);
            console.log("Update results:", results);
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'success',
                message: `Inventory updated for order ${nextOrderId}`,
                user: user || { _id: user_id, name, email: userEmail },
                details: { order_id: nextOrderId, results }
            });
        } catch (inventoryError) {
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'failure',
                message: `Inventory update failed for order ${nextOrderId}`,
                user: user || { _id: user_id, name, email: userEmail },
                details: {
                    order_id: nextOrderId,
                    error_details: inventoryError.message
                }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Inventory Update Batch',
                status: 'failure',
                message: `Inventory update batch failed for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.checkoutSession -> updateQuantities',
                error_details: inventoryError.message
            });
        }
    }

    const currentDate = new Date();
    const deliveryDate = new Date(currentDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    const day = deliveryDate.getDate();
    const dayOfWeek = deliveryDate.toLocaleString('default', { weekday: 'long' });
    const month = deliveryDate.toLocaleString('default', { month: 'long' });
    const formattedDeliveryDate = `${dayOfWeek}, ${day} ${month}`;

    const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
    const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
    const adminEmail = process.env.ADMIN_EMAIL;
    const logoUrl = "https://www.bazaar-uae.com/logo.png";

    const purchaseDetails = cartDataValue.map(
        (data) => {
            const isGift = !!data.isGiftWithPurchase;
            const nameDisplay = isGift ? `${data.name} (Free Gift)` : data.name;
            const priceDisplay = isGift ? "0.00" : data.price;
            return `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${nameDisplay}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant || "-"}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${priceDisplay}</td>
                </tr>
                `;
        }
    )
    .join("");

    const html = buildAdminOrderEmailHtml({
        logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone
    });

    const html1 = buildUserOrderEmailHtml({
        logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone
    });

    try {
        await sendEmail(adminEmail, adminSubject, html);
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'success',
            message: `Admin email sent for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: { order_id: nextOrderId, recipient: adminEmail }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'success',
            message: `Admin email sent for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail'
        });
    } catch (adminEmailError) {
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'failure',
            message: `Failed to send admin email for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: {
                order_id: nextOrderId,
                recipient: adminEmail,
                error_details: adminEmailError.message
            }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'failure',
            message: `Failed to send admin email for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail',
            error_details: adminEmailError.message
        });
    }

    try {
        await sendEmail(userEmail, userSubject, html1);
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'success',
            message: `User email sent for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: { order_id: nextOrderId, recipient: userEmail }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'success',
            message: `User email sent for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail'
        });
    } catch (userEmailError) {
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Email Sending',
            status: 'failure',
            message: `Failed to send user email for order ${nextOrderId}`,
            user: user || { _id: user_id, name, email: userEmail },
            details: {
                order_id: nextOrderId,
                recipient: userEmail,
                error_details: userEmailError.message
            }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Email Sending',
            status: 'failure',
            message: `Failed to send user email for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'orderController.checkoutSession -> sendEmail',
            error_details: userEmailError.message
        });
    }

    await Cart.findOneAndDelete({ user: user_id });

    return {
        message: "Order created successfully",
        orderId: order._id,
    };
};

exports.createTabbyCheckoutSession = async (userId, bodyData, metadata) => {
    const {
        cartData,
        shippingCost,
        name,
        phone,
        address,
        state,
        city,
        area,
        floorNo,
        buildingName,
        apartmentNo,
        landmark,
        currency,
        discountPercent,
        discountAmount,
        couponCode,
        payment_method,
        mobileNumber,
        paymentIntentId,
        txnId,
        paymentStatus,
        user_email,
        total,
        sub_total,
    } = bodyData;
    const user_id = userId;
    const fcmToken = metadata?.fcmToken || null;

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Checkout Session Tabby API Hit',
        status: 'success',
        message: `Tabby checkoutSessionTabby API hit - user: ${user_id || 'n/a'}, email: ${user_email || 'n/a'}, payment_method: ${payment_method || 'n/a'}. Order data: cartData, shippingCost, name, phone, address, state, city, area, floorNo, buildingName, apartmentNo, landmark, currency, discountPercent, discountAmount, couponCode, mobileNumber, user_email, total, sub_total, txnId, paymentStatus, fcmToken`,
        execution_path: 'orderController.checkoutSessionTabby (initial)'
    });

    if (payment_method !== 'tabby') {
        throw { status: 400, message: 'This endpoint is only for Tabby payments' };
    }

    if (!paymentIntentId) {
        throw { status: 400, message: 'paymentIntentId is required' };
    }

    console.log("💾 [Tabby] Storing order data for payment:", paymentIntentId);

    const formatDate = new Date().toLocaleDateString("en-GB", {
        day: "numeric",
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

    const orderTime = `${formatDate}, ${formatTime}`;

    // Store order data in PendingPayment for webhook processing
    const pendingPayment = new PendingPayment({
        user_id: user_id,
        payment_id: paymentIntentId,
        payment_method: 'tabby',
        order_data: {
            cartData,
            shippingCost,
            name,
            phone,
            address,
            state,
            city,
            area,
            floorNo,
            buildingName,
            apartmentNo,
            landmark,
            currency,
            discountPercent,
            discountAmount,
            couponCode,
            mobileNumber,
            user_email,
            total,
            sub_total,
            txnId,
            paymentStatus,
            fcmToken
        },
        status: 'pending',
        orderfrom: 'Mobile App',
        orderTime: orderTime
    });

    await pendingPayment.save();

    console.log("✅ [Tabby] Order data stored successfully, ready for payment");

    return {
        message: "Order data stored successfully",
        paymentId: paymentIntentId,
        status: "ready_for_payment"
    };
};

exports.verifyTabbyPayment = async (paymentId) => {
    if (!paymentId) {
        throw { status: 400, message: 'paymentId is required' };
    }

    const paymentResp = await axios.get(`https://api.tabby.ai/api/v2/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` }
    });
    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();

    if (status === 'AUTHORIZED') {
        const captureResp = await axios.post(
            `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
            { amount: payment.amount },
            { headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` } }
        );
        if (captureResp.data.status?.toUpperCase() !== 'CLOSED') {
            throw { status: 500, message: 'Capture failed' };
        }
    }

    const finalStatus = status === 'AUTHORIZED' ? 'CLOSED' : status;
    if (finalStatus === 'CLOSED') {
        return { message: `Payment status is ${status}` };
    }

    return { message: `Payment status is ${status}`, finalStatus };
};

exports.handleTabbyWebhook = async (payload) => {
    console.log("🚀 [Tabby Webhook] Webhook endpoint hit");
    const { clientIP, secret, data } = payload;

    const allowedIPs = process.env.TABBY_IPS.split(',');

    console.log("🌍 Client IP:", clientIP);
    if (!allowedIPs.includes(clientIP)) {
        console.log("❌ Returning 403: Forbidden IP");
        throw { status: 403, message: 'Forbidden IP' };
    }

    console.log("🔑 Expected secret:", process.env.TABBY_WEBHOOK_SECRET);
    console.log("📬 Received secret:", secret);
    if (secret !== process.env.TABBY_WEBHOOK_SECRET) {
        console.log("❌ Returning 401: Unauthorized (Invalid Secret)");
        throw { status: 401, message: 'Unauthorized' };
    }

    const { id: paymentId } = data;
    if (!paymentId) {
        console.log("⚠️ Returning 400: paymentId missing");
        throw { status: 400, message: 'paymentId missing' };
    }

    console.log("💳 Payment ID:", paymentId);

    const paymentResp = await axios.get(`https://api.tabby.ai/api/v2/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` }
    });

    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();
    console.log("📊 Payment status:", status);

    if (status === 'AUTHORIZED') {
        console.log("💰 Payment authorized — attempting capture...");
        const captureResp = await axios.post(
            `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
            { amount: payment.amount },
            { headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` } }
        );

        if (captureResp.data.status?.toUpperCase() !== 'CLOSED') {
            console.log("❌ Returning 500: Capture failed");
            throw { status: 500, message: 'Capture failed' };
        }
    }

    const finalStatus = status === 'AUTHORIZED' ? 'CLOSED' : status;
    const pkTime = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
    console.log('🕒 Time', pkTime);
    console.log("✅ Final Status:", finalStatus);

    if (finalStatus === 'CLOSED') {
        console.log("🎉 Payment successful, checking for pending payments...");

        // Check if there's a pending payment for this payment ID
        const pendingPayment = await PendingPayment.findOne({
            payment_id: paymentId,
            status: 'pending'
        });

        if (pendingPayment) {
            console.log("📋 [Webhook] Found pending payment, processing order creation...");
            // Process the pending payment and create the order
            await processPendingPayment(paymentId, payment);
        } else {
            console.log("📋 [Webhook] No pending payment found, payment was processed normally");
        }

        return { message: 'Order processed' };
    } else if (status === 'CREATED') {
        console.log("🎉 ================================================");
        console.log("🎉 ========== PAYMENT PROCEEDED SUCCESSFULLY ==========");
        console.log("🎉 ================================================");
        console.log(`🎉 Payment ID: ${paymentId}`);
        console.log(`🎉 Status: ${status}`);
        console.log("🎉 ================================================");

        // Check if there's a pending payment for this payment ID
        const pendingPayment = await PendingPayment.findOne({
            payment_id: paymentId,
            status: 'pending'
        });

        if (pendingPayment) {
            console.log("📋 [Webhook] Found pending payment, processing order creation...");
            // Process the pending payment and create the order
            await processPendingPayment(paymentId, payment);
        } else {
            console.log("📋 [Webhook] No pending payment found for CREATED status");
        }

        return { message: 'Order processed' };
    }

    console.log("📥 Returning 200: Webhook received");
    return { message: 'Webhook received' };
};

// ==================== Private Helpers ====================

async function verifyTabbyPayment(paymentId) {
    try {
        if (!paymentId) {
            return {
                status: false,
                finalStatus: 'missing_payment_id',
                message: 'paymentId is required',
            };
        }

        const paymentResp = await axios.get(`https://api.tabby.ai/api/v2/payments/${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}`
            }
        });

        const payment = paymentResp.data;
        const status = payment.status?.toUpperCase();

        const pkTime = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
        console.log('pkTime', pkTime);
        console.log('verifyTabbyPayment :: status', status);

        if (status === 'AUTHORIZED') {
            const captureResp = await axios.post(
                `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
                { amount: payment.amount },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}`
                    }
                }
            );

            const captureStatus = captureResp.data.status?.toUpperCase();
            if (captureStatus !== 'CLOSED') {
                return {
                    status: false,
                    finalStatus: captureStatus || 'UNKNOWN',
                    message: 'Capture failed'
                };
            }

            return {
                status: true,
                finalStatus: 'CLOSED'
            };
        }

        return {
            status: status === 'CLOSED',
            finalStatus: status,
            message: `Payment status is ${status}`
        };

    } catch (error) {
        console.error('Tabby Payment error:', error?.response?.data || error.message);
        const pkTime = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
        console.log('pkTime', pkTime);
        console.log('verifyTabbyPayment :: status', error?.response?.data || error.message);

        return {
            status: false,
            finalStatus: 'failed',
            message: 'Tabby verification error'
        };
    }
}

// Function to process pending payment and create order
async function processPendingPayment(paymentId, payment) {
    try {
        console.log("📋 [Pending Payment] Processing pending payment:", paymentId);

        // Find pending payment record
        const pendingPayment = await PendingPayment.findOne({
            payment_id: paymentId,
            status: 'pending'
        });

        if (!pendingPayment) {
            console.log("⚠️ [Pending Payment] No pending payment found for:", paymentId);
            return;
        }

        // Mark as processing
        pendingPayment.status = 'processing';
        pendingPayment.webhook_received = true;
        pendingPayment.webhook_status = 'CLOSED';
        await pendingPayment.save();

        // Extract order data
        const orderData = pendingPayment.order_data;
        const user_id = pendingPayment.user_id;

        console.log("📋 [Pending Payment] Creating order for user:", user_id);

        // Create cart data entry
        const cartDataEntryValue = await CartData.create({ cartData: orderData.cartData });
        const cartDataId = cartDataEntryValue._id;

        const cartDataEntry = await CartData.findById(cartDataId);
        const cartDataValue = cartDataEntry.cartData;

        const formatter = new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        let formattedshippingCost = 0;
        if(orderData.shippingCost) {
            formattedshippingCost = formatter.format(orderData.shippingCost);
        } else {
            formattedshippingCost = formatter.format(0);
        }

        // Calculate amounts
        const amount_subtotal = orderData.sub_total;
        const amount_total = orderData.total;
        const discountAmount = orderData.discountAmount;

        // Values are already in correct format (88.39), no need to divide by 100
        const db_subtotal_amount = amount_subtotal.toFixed(2);
        const db_total_amount = amount_total.toFixed(2);

        const formatted_subtotal_amount = formatter.format(amount_subtotal);
        const formatted_total_amount = formatter.format(amount_total);

        // const discount_amount_long = Number(amount_subtotal) - Number(amount_total);
        const discount_amount_long = Number(discountAmount);
        const discount_amount = formatter.format(discount_amount_long);

        // Generate order details
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

        const lastOrder = await Order.findOne().sort({ order_no: -1 }).select("order_no");
        let nextOrderNo = 1;
        if(lastOrder && lastOrder.order_no) {
            nextOrderNo = lastOrder.order_no + 1;
        }

        const year = new Date().getFullYear();
        const uniquePart = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 3);
        const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(3, "0")}${uniquePart}`;

        // Create order
        const order = await Order.create({
            user_id,
            order_id: nextOrderId,
            order_no: nextOrderNo,
            order_datetime: orderDateTime,
            name: orderData.name,
            email: orderData.user_email,
            address: orderData.address,
            state: orderData.state,
            city: orderData.city || '-',
            area: orderData.area || '-',
            floorNo: orderData.floorNo || '-',
            buildingName: orderData.buildingName || '-',
            apartmentNo: orderData.apartmentNo || '-',
            landmark: orderData.landmark != null ? String(orderData.landmark) : '-',
            amount_subtotal: db_subtotal_amount,
            amount_total: db_total_amount,
            discount_amount,
            phone: orderData.phone,
            shipping: orderData.shippingCost,
            txn_id: paymentId,
            status: 'confirmed',
            payment_status: 'paid',
            stripe_checkout_session_id: paymentId,
            payment_method: 'tabby',
            orderfrom: 'Mobile App',
        });

        order.orderTracks.push({
            status: "Confirmed",
            dateTime: new Date(),
            image: null,
        });

        await order.save();

        const user = await User.findById(user_id);
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Order Creation',
            status: 'success',
            message: `Order ${nextOrderId} created successfully via webhook`,
            user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
            details: { order_id: nextOrderId, payment_id: paymentId }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Order Creation',
            status: 'success',
            message: `Order ${nextOrderId} created successfully via webhook`,
            order_id: nextOrderId,
            execution_path: 'orderController.processPendingPayment -> Order.create'
        });

        if (orderData.couponCode && orderData.mobileNumber) {
            const coupon = await Coupon.findOneAndUpdate(
                {
                    coupon: orderData.couponCode,
                    phone: orderData.mobileNumber,
                    status: "unused"
                },
                {
                    status: "used"
                },
                {
                    new: true
                }
            );

            if (coupon) {
                console.log(`Coupon ${orderData.couponCode} status updated to 'used' after order creation.`);
            } else {
                console.log(
                    `Coupon ${orderData.couponCode} not found, already used, or does not match the mobile number.`
                );
            }
        }

        if (orderData.couponCode === 'FIRST15') {
            const user = await User.findById(user_id);
            if (user) {
                user.usedFirst15Coupon = true;
                await user.save();
                console.log(`FIRST15 coupon marked as used for user: ${user_id} after order creation.`);
            }
        }

        if (orderData.couponCode === 'UAE10') {
            const user = await User.findById(user_id);
            if (user && !user.usedUAE10Coupon) {
                user.usedUAE10Coupon = true;
                await user.save();
                console.log(`UAE10 coupon marked as used for user: ${user_id} after order creation.`);
            }
        }

        const orderDetails = cartDataValue.map((item) => {
            const isGift = !!item.isGiftWithPurchase;
            const amount = isGift ? 0 : (Number(item.price) || 0);
            return {
                order_id: order._id,
                product_id: item.id || item.product_id,
                productId: item.product_id || item.id,
                product_name: item.name,
                product_image: item.image,
                variant_name: item.variant,
                amount,
                quantity: item.qty,
                isGiftWithPurchase: isGift,
                nonReturnable: isGift,
            };
        });

        await OrderDetail.insertMany(orderDetails);

        // Update quantities if in production
        if (process.env.ENVIRONMENT === "true") {
            try {
                const results = await updateQuantities(orderData.cartData, nextOrderId);
                console.log("Update results:", results);
                await logActivity({
                    platform: 'Mobile App Backend',
                    log_type: 'backend_activity',
                    action: 'Inventory Update',
                    status: 'success',
                    message: `Inventory updated for order ${nextOrderId}`,
                    user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                    details: { order_id: nextOrderId, results }
                });
            } catch (inventoryError) {
                await logActivity({
                    platform: 'Mobile App Backend',
                    log_type: 'backend_activity',
                    action: 'Inventory Update',
                    status: 'failure',
                    message: `Inventory update failed for order ${nextOrderId}`,
                    user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                    details: {
                        order_id: nextOrderId,
                        error_details: inventoryError.message
                    }
                });

                await logBackendActivity({
                    platform: 'Mobile App Backend',
                    activity_name: 'Inventory Update Batch',
                    status: 'failure',
                    message: `Inventory update batch failed for order ${nextOrderId}`,
                    order_id: nextOrderId,
                    execution_path: 'orderController.processPendingPayment -> updateQuantities',
                    error_details: inventoryError.message
                });
            }
        }

        // Send emails (admin and user)
        const currentDate = new Date();
        const deliveryDate = new Date(currentDate.getTime() + 3 * 24 * 60 * 60 * 1000);
        const day = deliveryDate.getDate();
        const month = deliveryDate.toLocaleString('default', { month: 'long' });
        const deliveryYear = deliveryDate.getFullYear();
        const formattedDeliveryDate = `${day} ${month} ${deliveryYear}`;

        const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
        const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
        const adminEmail = process.env.ADMIN_EMAIL;
        const logoUrl = "https://www.bazaar-uae.com/logo.png";

        const purchaseDetails = cartDataValue.map(
            (data) => {
                const isGift = !!data.isGiftWithPurchase;
                const nameDisplay = isGift ? `${data.name} (Free Gift)` : data.name;
                const priceDisplay = isGift ? "0.00" : data.price;
                return `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${nameDisplay}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant || "-"}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${priceDisplay}</td>
                </tr>
                `;
            }
        ).join("");

        const html = buildWebhookAdminEmailHtml({
            logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
            formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
            orderData
        });

        const html1 = buildWebhookUserEmailHtml({
            logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
            formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
            orderData
        });

        // Send emails
        console.log("📧 ================================================");
        console.log("📧 ========== SENDING EMAIL NOTIFICATIONS ==========");
        console.log("📧 ================================================");
        console.log(`📧 Admin Email: ${adminEmail}`);
        console.log(`📧 User Email: ${orderData.user_email}`);
        console.log(`📧 Order ID: ${nextOrderId}`);
        console.log("📧 ================================================");

        try {
            await sendEmail(adminEmail, adminSubject, html);
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'success',
                message: `Admin email sent for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                details: { order_id: nextOrderId, recipient: adminEmail }
            });

            // Log to backend logger
            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Email Sending',
                status: 'success',
                message: `Admin email sent for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.processPendingPayment -> sendEmail'
            });
        } catch (adminEmailError) {
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'failure',
                message: `Failed to send admin email for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                details: {
                    order_id: nextOrderId,
                    recipient: adminEmail,
                    error_details: adminEmailError.message
                }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Email Sending',
                status: 'failure',
                message: `Failed to send admin email for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.processPendingPayment -> sendEmail',
                error_details: adminEmailError.message
            });
        }

        try {
            await sendEmail(orderData.user_email, userSubject, html1);
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'success',
                message: `User email sent for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                details: { order_id: nextOrderId, recipient: orderData.user_email }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Email Sending',
                status: 'success',
                message: `User email sent for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.processPendingPayment -> sendEmail'
            });
        } catch (userEmailError) {
            await logActivity({
                platform: 'Mobile App Backend',
                log_type: 'backend_activity',
                action: 'Email Sending',
                status: 'failure',
                message: `Failed to send user email for order ${nextOrderId}`,
                user: user || { _id: user_id, name: orderData.name, email: orderData.user_email },
                details: {
                    order_id: nextOrderId,
                    recipient: orderData.user_email,
                    error_details: userEmailError.message
                }
            });

            await logBackendActivity({
                platform: 'Mobile App Backend',
                activity_name: 'Email Sending',
                status: 'failure',
                message: `Failed to send user email for order ${nextOrderId}`,
                order_id: nextOrderId,
                execution_path: 'orderController.processPendingPayment -> sendEmail',
                error_details: userEmailError.message
            });
        }

        console.log("✅ ================================================");
        console.log("✅ ========== EMAILS SENT SUCCESSFULLY ==========");
        console.log("✅ ================================================");

        // Clear user's cart
        await Cart.findOneAndDelete({ user: user_id });

        // Send push notification
        console.log("🔔 ================================================");
        console.log("🔔 ========== SENDING PUSH NOTIFICATION ==========");
        console.log("🔔 ================================================");

        if (user && user.fcmToken) {
            console.log(`🔔 User FCM Token: ${user.fcmToken.substring(0, 20)}...`);
            console.log(`🔔 Order ID: ${nextOrderId}`);
            console.log(`🔔 User: ${orderData.name}`);

            // await sendPushNotification(
            //     user.fcmToken,
            //     `Order No: ${nextOrderId} Placed Successfully`,
            //     `Hi ${orderData.name}, your order of AED ${amount_total} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
            //     user_id,
            //     order._id
            // );

            console.log("✅ ================================================");
            console.log("✅ ========== PUSH NOTIFICATION SENT ==========");
            console.log("✅ ================================================");
        } else {
            console.log("⚠️ No FCM token found for user");
        }

        // Mark pending payment as completed
        pendingPayment.status = 'completed';
        await pendingPayment.save();

        console.log("✅ [Pending Payment] Order created successfully:", order._id);

    } catch (error) {
        console.error("❌ [Pending Payment] Error processing pending payment:", error);

        // Log error
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Order Processing',
            status: 'failure',
            message: `Failed to process pending payment: ${error.message}`,
            user: { _id: null },
            details: {
                payment_id: paymentId,
                error_details: error.message,
                stack: error.stack
            }
        });

        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Order Processing',
            status: 'failure',
            message: `Failed to process pending payment: ${error.message}`,
            execution_path: 'orderController.processPendingPayment',
            error_details: error.message
        });

        // Mark pending payment as failed
        const pendingPayment = await PendingPayment.findOne({ payment_id: paymentId });
        if (pendingPayment) {
            pendingPayment.status = 'failed';
            await pendingPayment.save();
        }
    }
}

async function getDiagnosticInventory(lightspeedVariantId) {
    const diag = { lightspeedQty: null, localQty: null, lightspeedError: null, localError: null };
    try {
        const invRes = await axios.get(
            `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${lightspeedVariantId}/inventory`,
            { headers: { Authorization: `Bearer ${LS_API_KEY}`, Accept: "application/json" } }
        );
        diag.lightspeedQty = invRes.data?.data?.[0]?.inventory_level ?? null;
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
        const v = doc?.variantsData?.find((vv) => String(vv.id) === String(lightspeedVariantId));
        diag.localQty = v != null ? v.qty : null;
        if (!doc) diag.localError = "Product not found in local DB";
        else if (v == null) diag.localError = `Variant ${lightspeedVariantId} not in variantsData`;
    } catch (e) {
        diag.localError = e?.message || String(e);
    }
    return diag;
}

async function updateQuantities(cartData, orderId = null) {
    try {
        const emailDetails = [];
        const updateResults = await Promise.all(
            cartData.map(async (item, index) => {
                const updateQty = item.total_qty - item.qty;
                const mongoId = item.product_id || item.id;
                const name = item.name;
                const lightspeedVariantId = item.variantId || item.id;

                const beforeDiag = await getDiagnosticInventory(lightspeedVariantId);

                let update = false;
                try {
                    // update = await updateQuantity(lightspeedVariantId, updateQty, name, lightspeedVariantId);
                    update = true;
                } catch (lsError) {
                    const afterDiagOnThrow = await getDiagnosticInventory(lightspeedVariantId);
                    const qtyMsgThrow = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER (unchanged): Lightspeed=${afterDiagOnThrow.lightspeedQty} Local=${afterDiagOnThrow.localQty} | Expected=${updateQty}. Lightspeed API THREW: ${lsError?.message}`;
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
                            qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                            qty_after: { lightspeed: afterDiagOnThrow.lightspeedQty, local: afterDiagOnThrow.localQty },
                            expected_after: updateQty,
                            qty_sold: item.qty,
                        }
                    });
                    await logBackendActivity({
                        platform: 'Mobile App Backend',
                        activity_name: 'Product Database Update',
                        status: 'failure',
                        message: `Product ${name} - Lightspeed API threw. ${qtyMsgThrow}`,
                        product_id: lightspeedVariantId?.toString?.(),
                        product_name: name,
                        order_id: orderId,
                        execution_path: 'orderController.updateQuantities -> Lightspeed API',
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
                                    qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                                    qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
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
                            const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
                            const qtyMsgFail = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty}. Local DB sync FAILED.`;
                            await logActivity({
                                platform: 'Mobile App Backend',
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
                                platform: 'Mobile App Backend',
                                activity_name: 'Product Database Update',
                                status: 'failure',
                                message: `Product ${name} - local DB sync failed. ${qtyMsgFail}`,
                                product_id: lightspeedVariantId?.toString?.(),
                                product_name: name,
                                order_id: orderId,
                                execution_path: 'orderController.updateQuantities -> Product.findOneAndUpdate',
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
                        platform: 'Mobile App Backend',
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
                        platform: 'Mobile App Backend',
                        activity_name: 'Product Database Update',
                        status: 'failure',
                        message: `Product ${name} - Lightspeed API failed. ${qtyMsgLsFail}`,
                        product_id: lightspeedVariantId?.toString?.(),
                        product_name: name,
                        order_id: orderId,
                        execution_path: 'orderController.updateQuantities -> Lightspeed API',
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
                    `Update for product ID ${lightspeedVariantId}, Name ${name} was ${
                        update ? "successful" : "failed"
                    }`
                );
                return update;
            })
        );

        console.log("All updates completed:", updateResults);
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
        console.error("Error in updating quantities for the cart:", error);

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
            console.log(`Successfully updated quantity for product with ID: ${id}`);

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
            console.warn(`Unexpected response status: ${productsResponse.status}`);

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
        console.warn(
            "Error updating product from Lightspeed:",
            error.response ? error.response.data : error.message
        );

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

const fetchProductDetails = async (id) => {
    try {
        const response = await axios.get(
            `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${LS_API_KEY}`,
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
                        Authorization: `Bearer ${LS_API_KEY}`,
                        Accept: "application/json",
                    },
                }
            );
            const inventoryLevel =
                inventoryResponse.data.data?.[0]?.inventory_level || 0;

            if (
                inventoryLevel > 0 &&
                parseFloat(product.price_standard.tax_exclusive) !== 0
            ) {
                variantsData.push({
                    qty: inventoryLevel,
                    id: product.id,
                    sku: product.sku_number,
                    name: product.name,
                    price: product.price_standard.tax_exclusive,
                });
                totalQty += inventoryLevel;
            }
        } else {
            for (const variant of product.variants) {
                const variantId = variant.id;
                const variantPrice = variant.price_standard.tax_exclusive;
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
                            Authorization: `Bearer ${LS_API_KEY}`,
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

// ==================== Email Template Helpers ====================

function buildAdminOrderEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone } = params;

    return `
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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>A new order has been placed on Bazaar.</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Below are the order details:</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Please review and process the order at your earliest convenience.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Thank you for your continued support in ensuring excellent service for our customers.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>

                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_subtotal}</b></th>
                                                        </tr>
                                                    </thead>

                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>

                                                    ${discount_amount_long > 0 ? `
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED -${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    ` : ''}
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${total.toFixed(2)}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Customer Information</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark != null ? String(landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}

function buildUserOrderEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        amount_subtotal, formattedshippingCost, discount_amount_long, discount_amount, total,
        name, userEmail, address, city, area, buildingName, floorNo, apartmentNo, landmark, phone } = params;

    return `
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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>Get it By:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>${name}</b>! Thank you for your order with Bazaar!</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">We have received your order and are processing it. Below are the details of your purchase</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">If you have any questions about your order, feel free to reply to this email or contact our support team.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">We appreciate your business and look forward to serving you again soon!</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling: touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_subtotal}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED -${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${total.toFixed(2)}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>

                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Billing Details</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark != null ? String(landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}

function buildWebhookAdminEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
        orderData } = params;

    return `
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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>A new order has been placed on Bazaar.</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Below are the order details:</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Please review and process the order at your earliest convenience.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Thank you for your continued support in ensuring excellent service for our customers.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>

                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>
                                                        <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th>
                                                        </tr>
                                                    </thead>


                                                    ${discount_amount_long > 0 ? `
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    ` : ''}
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_total}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Customer Information</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${orderData.name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${orderData.user_email}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${orderData.address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${orderData.city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${orderData.area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${orderData.buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${orderData.floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${orderData.apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${orderData.landmark != null ? String(orderData.landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${orderData.phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}

function buildWebhookUserEmailHtml(params) {
    const { logoUrl, nextOrderId, orderDateTime, formattedDeliveryDate, purchaseDetails,
        formattedshippingCost, formatted_subtotal_amount, discount_amount_long, discount_amount, amount_total,
        orderData } = params;

    return `
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
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>Get it By:</b> ${formattedDeliveryDate}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>${orderData.name}</b>! Thank you for your order with Bazaar!</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">We have received your order and are processing it. Below are the details of your purchase</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">If you have any questions about your order, feel free to reply to this email or contact our support team.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">We appreciate your business and look forward to serving you again soon!</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="overflow-x:auto; -webkit-overflow-scrolling: touch; width:100%;">
                                                <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="min-width:600px; text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <thead style="text-align: center;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                        ${purchaseDetails}
                                                    </tbody>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discount_amount}</b></th>
                                                        </tr>
                                                    </thead>
                                                    <thead style="text-align: center; margin-top: 100px;">
                                                        <tr style="background-color: #f8f9fa; text-align: center;">
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${amount_total}</b></th>
                                                        </tr>
                                                    </thead>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>

                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Billing Details</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${orderData.name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${orderData.user_email}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Address: ${orderData.address}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${orderData.city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${orderData.area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${orderData.buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${orderData.floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${orderData.apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${orderData.landmark != null ? String(orderData.landmark) : '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${orderData.phone}</p>
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
                            </td>
                        </tr>
                    </table>
                </body>`;
}
