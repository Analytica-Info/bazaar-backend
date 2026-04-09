const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const OrderDetail = require('../models/OrderDetail');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Wishlist = require('../models/Wishlist');
const Category = require('../models/Category');
const backendLogger = require('../utilities/backendLogger');

const BACKEND_URL = process.env.BACKEND_URL;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * For a list of order details, fetch products in bulk and attach SKU to each detail.
 * Shared logic used by getUserOrders, getPaymentHistory, and getDashboard.
 */
const attachSkuToOrderDetails = async (orderDetails) => {
    const productIds = orderDetails
        .map(detail => detail.product_id)
        .filter(id => id)
        .map(id => new mongoose.Types.ObjectId(id));

    const products = await Product.find({ _id: { $in: productIds } }).exec();

    const productSkuMap = {};
    products.forEach(product => {
        const productId = product._id.toString();
        const sku = product.product?.sku_number || null;
        productSkuMap[productId] = sku;
    });

    return orderDetails.map(detail => {
        const productId = detail.product_id?.toString();
        const sku = productSkuMap[productId] || null;
        return {
            ...detail.toObject(),
            sku: sku,
        };
    });
};

/**
 * For a list of orders, populate each with its order details + SKU info.
 * Used by getUserOrders, getPaymentHistory, getDashboard.
 */
const populateOrdersWithDetails = async (orders, { includeSku = true } = {}) => {
    return Promise.all(
        orders.map(async (order) => {
            const orderDetails = await OrderDetail.find({
                order_id: new mongoose.Types.ObjectId(order._id),
            }).exec();

            let finalDetails;
            if (includeSku) {
                finalDetails = await attachSkuToOrderDetails(orderDetails);
            } else {
                finalDetails = orderDetails;
            }

            return {
                ...order.toObject(),
                order_details: finalDetails || [],
            };
        })
    );
};

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

/**
 * Get all orders for a user with order details and SKUs.
 * From ecommerce userController.orders
 *
 * Returns { orders, totalOrders, shippedOrders, deliveredOrders, canceledOrders }
 */
exports.getUserOrders = async (userId) => {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const orders = await Order.find({
        $or: [
            { userId: userObjectId },
            { user_id: userObjectId },
        ],
    });

    const updatedOrders = await populateOrdersWithDetails(orders);

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No orders found.' };
    }

    const totalOrders = updatedOrders.length;
    const shippedOrders = updatedOrders.filter(
        (order) => order.status.toLowerCase() === 'shipped'
    ).length;
    const deliveredOrders = updatedOrders.filter(
        (order) => order.status.toLowerCase() === 'delivered'
    ).length;
    const canceledOrders = updatedOrders.filter(
        (order) => order.status.toLowerCase() === 'canceled'
    ).length;

    return {
        orders: updatedOrders,
        total_orders: totalOrders,
        shipped_orders: shippedOrders,
        delivered_orders: deliveredOrders,
        canceled_orders: canceledOrders,
    };
};

/**
 * Get a single order with its details.
 * From ecommerce userController.order
 *
 * Returns { orders }
 */
exports.getOrder = async (userId, orderId) => {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const orders = await Order.find({
        _id: orderId,
        $or: [
            { userId: userObjectId },
            { user_id: userObjectId },
        ],
    });

    const updatedOrders = await populateOrdersWithDetails(orders, { includeSku: false });

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No orders found.' };
    }

    return { orders: updatedOrders };
};

/**
 * Get payment history (all orders with details + SKUs).
 * From ecommerce userController.paymentHistory
 *
 * Returns { history }
 */
exports.getPaymentHistory = async (userId) => {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const orders = await Order.find({
        $or: [
            { userId: userObjectId },
            { user_id: userObjectId },
        ],
    });

    const updatedOrders = await populateOrdersWithDetails(orders);

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No payment history found.' };
    }

    return { history: updatedOrders };
};

/**
 * Get a single payment history entry.
 * From ecommerce userController.singlePaymentHistory
 *
 * Returns { history }
 */
exports.getSinglePaymentHistory = async (userId, paymentId) => {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const orders = await Order.find({
        _id: paymentId,
        $or: [
            { userId: userObjectId },
            { user_id: userObjectId },
        ],
    });

    const updatedOrders = await populateOrdersWithDetails(orders, { includeSku: false });

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No payment history found.' };
    }

    return { history: updatedOrders };
};

/**
 * Get mobile payment history (last 10 orders, formatted for Tabby/payment providers).
 * From mobile authController.getPaymentHistory
 *
 * userCreatedAt: the user's registration date (for buyer_history)
 *
 * Returns { payment: { order_history, buyer_history } }
 */
exports.getMobilePaymentHistory = async (userId, userCreatedAt) => {
    const allOrders = await Order.find({ user_id: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('order_id order_no order_datetime amount_total status payment_status payment_method createdAt name email phone address state')
        .lean();

    const recentOrders = allOrders;

    const orderIds = recentOrders.map(order => order._id);
    const orderDetails = await OrderDetail.find({ order_id: { $in: orderIds } }).lean();

    const detailsMap = {};
    orderDetails.forEach(detail => {
        const key = detail.order_id.toString();
        if (!detailsMap[key]) detailsMap[key] = [];
        detailsMap[key].push(detail);
    });

    const successfulOrders = await Order.countDocuments({
        user_id: userId,
        payment_status: {
            $nin: ['pending', 'failed', 'cancelled', 'refunded', 'expired'],
        },
    });

    const registeredSince = userCreatedAt;

    const mapPaymentMethod = (method) => {
        switch (method?.toLowerCase()) {
            case 'card':
            case 'stripe':
                return 'card';
            case 'tabby':
                return 'tabby';
            case 'cash':
                return 'cash';
            default:
                return 'card';
        }
    };

    const mapOrderStatus = (status) => {
        switch (status?.toLowerCase()) {
            case 'confirmed':
                return 'newOne';
            case 'packed':
                return 'packed';
            case 'on the way':
                return 'shipped';
            case 'delivered':
                return 'delivered';
            case 'cancelled':
                return 'cancelled';
            default:
                return 'newOne';
        }
    };

    const response = {
        payment: {
            order_history: recentOrders.map(order => {
                const orderDetailsForOrder = detailsMap[order._id.toString()] || [];

                return {
                    purchasedAt: order.createdAt.toISOString(),
                    amount: order.amount_total,
                    paymentMethod: mapPaymentMethod(order.payment_method),
                    status: mapOrderStatus(order.status),
                    buyer: {
                        email: order.email,
                        phone: order.phone,
                        name: order.name,
                    },
                    items: orderDetailsForOrder.map(item => ({
                        title: item.product_name,
                        quantity: item.quantity,
                        unitPrice: item.amount.toString(),
                        category: item.variant_name || 'General',
                    })),
                    shippingAddress: {
                        city: order.state || 'Unknown',
                        address: order.address,
                        zip: '00000',
                    },
                };
            }),
            buyer_history: {
                registered_since: registeredSince,
                loyalty_level: successfulOrders,
            },
        },
    };

    return response;
};

/**
 * Get dashboard data: recent orders, totals, wishlist count.
 * From ecommerce userController.dashboard
 *
 * Returns { recentOrders, totalSpent, totalOrders, activeOrders, wishlistItem }
 */
exports.getDashboard = async (userId) => {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const orders = await Order.find({
        $or: [
            { userId: userObjectId },
            { user_id: userObjectId },
        ],
    }).sort({ createdAt: -1 });

    const updatedOrders = await populateOrdersWithDetails(orders);

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No payment history found.' };
    }

    const totalOrders = updatedOrders.length;
    const totalSpent = updatedOrders.reduce(
        (sum, order) => sum + parseFloat(order.amount_total || 0),
        0
    );
    const formattedTotalSpent = Number(totalSpent.toFixed(2));
    const activeOrders = updatedOrders.filter(
        (order) => order.status.toLowerCase() !== 'delivered'
    ).length;

    const wishlist = await Wishlist.findOne({ user: userObjectId });
    const wishlistItem = wishlist ? wishlist.items.length : 0;

    return {
        recent_orders: updatedOrders,
        total_spent: formattedTotalSpent,
        total_orders: totalOrders,
        active_orders: activeOrders,
        wishlist_item: wishlistItem,
    };
};

/**
 * Get current month's top 5 order categories.
 * From ecommerce userController.currentMonthOrderCategories
 *
 * Returns { data, message }
 */
exports.getCurrentMonthOrderCategories = async () => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const orders = await Order.find({
        createdAt: {
            $gte: currentMonthStart,
            $lte: currentMonthEnd,
        },
    }).exec();

    if (orders.length === 0) {
        return {
            data: [],
            message: 'No orders found for current month',
        };
    }

    const orderIds = orders.map(order => order._id);

    const orderDetails = await OrderDetail.find({
        order_id: { $in: orderIds },
    }).exec();

    const productIds = [...new Set(orderDetails.map(detail => detail.product_id))];

    const products = await Product.find({
        _id: { $in: productIds },
    });

    const productCategoryMap = {};
    products.forEach(product => {
        if (product.product && product.product.id && product.product.product_type_id) {
            productCategoryMap[product._id] = product.product.product_type_id;
        }
    });

    const categories = await Category.find();
    const categoryMap = {};

    if (categories && categories[0] && categories[0].search_categoriesList) {
        categories[0].search_categoriesList.forEach(category => {
            categoryMap[category.id] = category.name;
        });
    }

    const categoryCount = {};

    orderDetails.forEach(detail => {
        const categoryId = productCategoryMap[detail.product_id];
        if (categoryId && categoryMap[categoryId]) {
            const categoryName = categoryMap[categoryId];
            if (categoryCount[categoryName]) {
                categoryCount[categoryName] += detail.quantity;
            } else {
                categoryCount[categoryName] = detail.quantity;
            }
        }
    });

    const data = Object.entries(categoryCount)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    return {
        data,
        message: 'Current month order categories retrieved successfully',
    };
};

/**
 * Get user's purchased products with review status.
 * From ecommerce userController.review
 *
 * Returns { products }
 */
exports.getUserReviews = async (userId) => {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const orders = await Order.find({
        $or: [
            { userId: userObjectId },
            { user_id: userObjectId },
        ],
    });

    if (orders.length === 0) {
        return { products: [] };
    }

    const orderIds = orders.map(order => order._id);
    const orderDetails = await OrderDetail.find({
        order_id: { $in: orderIds },
    });

    const productIds = orderDetails.map(detail => detail.product_id);
    const productObjectIds = productIds.map(id => new mongoose.Types.ObjectId(id));

    const products = await Product.find({
        _id: { $in: productObjectIds },
    });

    const userReviews = await Review.find({
        user_id: userObjectId,
        product_id: { $in: productObjectIds },
    });

    const userReviewsByProduct = {};
    userReviews.forEach(review => {
        userReviewsByProduct[review.product_id.toString()] = review;
    });

    const orderDetailsByProduct = {};
    orderDetails.forEach(detail => {
        if (!orderDetailsByProduct[detail.product_id]) {
            orderDetailsByProduct[detail.product_id] = [];
        }
        orderDetailsByProduct[detail.product_id].push(detail);
    });

    const productsWithReviews = products.map(product => {
        const productId = product._id.toString();
        const userReview = userReviewsByProduct[productId] || null;
        const productOrderDetails = orderDetailsByProduct[productId] || [];

        const firstOrderDetail = productOrderDetails[0];
        const order = firstOrderDetail
            ? orders.find(o => o._id.toString() === firstOrderDetail.order_id.toString())
            : null;

        const orderData = order ? {
            _id: order._id,
            order_id: order.order_id,
            order_no: order.order_no,
            order_datetime: order.order_datetime,
            name: order.name,
            phone: order.phone,
            state: order.state,
            address: order.address,
            email: order.email,
            status: order.status,
            amount_subtotal: order.amount_subtotal,
            amount_total: order.amount_total,
            discount_amount: order.discount_amount,
            shipping: order.shipping,
            txn_id: order.txn_id,
            payment_method: order.payment_method,
            payment_status: order.payment_status,
            checkout_session_id: order.checkout_session_id,
            orderTracks: order.orderTracks,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
        } : null;

        return {
            ...product.toObject(),
            user_review: userReview,
            order_details: orderData,
        };
    });

    return { products: productsWithReviews };
};

/**
 * Add or update a review for a product.
 * From ecommerce userController.addReview
 *
 * imagePath: full URL for the uploaded image (controller builds it)
 *
 * Returns { message, reviews }
 */
exports.addReview = async (userId, { productId, name, description, title, qualityRating, valueRating, priceRating }, imagePath) => {
    let file = '';
    if (imagePath) {
        file = imagePath;
    }

    const existingReview = await Review.findOne({ user_id: userId, product_id: productId });

    if (existingReview) {
        existingReview.nickname = name;
        existingReview.summary = description;
        existingReview.texttext = title;
        existingReview.quality_rating = qualityRating;
        existingReview.value_rating = valueRating;
        existingReview.price_rating = priceRating;
        if (file) existingReview.image = file;

        await existingReview.save();
    } else {
        await Review.create({
            user_id: userId,
            nickname: name,
            summary: description,
            texttext: title,
            image: file,
            product_id: productId,
            quality_rating: qualityRating,
            value_rating: valueRating,
            price_rating: priceRating,
        });
    }

    const reviews = await Review.find();
    const mappedReviews = reviews.map(r => ({
        ...r._doc,
        name: r.nickname,
        description: r.summary,
        title: r.texttext,
    }));

    return {
        message: existingReview
            ? 'Review updated successfully'
            : 'Review created successfully',
        reviews: mappedReviews,
    };
};
