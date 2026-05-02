const mongoose = require('mongoose');
const repos = require('../repositories');
const cache = require('../utilities/cache');
const clock = require('../utilities/clock');

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * For a list of orders, populate each with its order details + SKU info.
 * Two queries total — all OrderDetails + all Products in $in batch (no N+1).
 */
const populateOrdersWithDetails = async (orders, { includeSku = true } = {}) => {
    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => new mongoose.Types.ObjectId(o._id));
    const allOrderDetails = await repos.orderDetails.findForOrders(orderIds);

    const detailsByOrderId = {};
    for (const d of allOrderDetails) {
        const k = String(d.order_id);
        if (!detailsByOrderId[k]) detailsByOrderId[k] = [];
        detailsByOrderId[k].push(d);
    }

    let productSkuMap = {};
    if (includeSku) {
        const productIds = [
            ...new Set(
                allOrderDetails
                    .map((d) => d.product_id)
                    .filter(Boolean)
                    .map((id) => String(id))
            ),
        ].map((id) => new mongoose.Types.ObjectId(id));

        productSkuMap = await repos.products.findSkuMap(productIds);
    }

    return orders.map((order) => {
        const details = detailsByOrderId[String(order._id)] || [];
        const finalDetails = includeSku
            ? details.map((d) => ({
                  ...d,
                  sku: productSkuMap[String(d.product_id)] || null,
              }))
            : details;
        return {
            ...(typeof order.toObject === "function" ? order.toObject() : order),
            order_details: finalDetails,
        };
    });
};

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

/**
 * Get all orders for a user with order details and SKUs.
 * Returns { orders, total_orders, shipped_orders, delivered_orders, canceled_orders }
 */
exports.getUserOrders = async (userId, opts) => {
    const orders = await repos.orders.findForUser(userId, opts);

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
 */
exports.getOrder = async (userId, orderId) => {
    const orders = await repos.orders.findOneForUser(userId, orderId);

    const updatedOrders = await populateOrdersWithDetails(orders, { includeSku: false });

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No orders found.' };
    }

    return { orders: updatedOrders };
};

/**
 * Get payment history (all orders with details + SKUs).
 */
exports.getPaymentHistory = async (userId) => {
    const orders = await repos.orders.findForUser(userId);

    const updatedOrders = await populateOrdersWithDetails(orders);

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No payment history found.' };
    }

    return { history: updatedOrders };
};

/**
 * Get a single payment history entry.
 */
exports.getSinglePaymentHistory = async (userId, paymentId) => {
    const orders = await repos.orders.findOneForUser(userId, paymentId);

    const updatedOrders = await populateOrdersWithDetails(orders, { includeSku: false });

    if (updatedOrders.length === 0) {
        throw { status: 404, message: 'No payment history found.' };
    }

    return { history: updatedOrders };
};

/**
 * Get Tabby buyer history (last 10 orders, formatted for Tabby credit assessment).
 */
exports.getTabbyBuyerHistory = async (userId, userCreatedAt) => {
    const recentOrders = await repos.orders.findRecentForTabbyHistory(userId, { limit: 10 });

    const orderIds = recentOrders.map(order => order._id);
    const orderDetails = await repos.orderDetails.findForOrders(orderIds);

    const detailsMap = {};
    orderDetails.forEach(detail => {
        const key = detail.order_id.toString();
        if (!detailsMap[key]) detailsMap[key] = [];
        detailsMap[key].push(detail);
    });

    const successfulOrders = await repos.orders.countSuccessfulOrders(userId);

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
 */
exports.getDashboard = async (userId) => {
    const orders = await repos.orders.findForUser(userId);

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

    const wishlistItem = await repos.wishlists.countItemsForUser(userId);

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
 */
exports.getCurrentMonthOrderCategories = async () => {
    const now = clock.now();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const orders = await repos.orders.findByDateRange(currentMonthStart, currentMonthEnd);

    if (orders.length === 0) {
        return {
            data: [],
            message: 'No orders found for current month',
        };
    }

    const orderIds = orders.map(order => order._id);
    const orderDetails = await repos.orderDetails.findForOrders(orderIds);

    const productIds = [...new Set(orderDetails.map(detail => detail.product_id))];
    const products = await repos.products.findByIds(productIds);

    const productCategoryMap = {};
    products.forEach(product => {
        if (product.product && product.product.id && product.product.product_type_id) {
            productCategoryMap[product._id] = product.product.product_type_id;
        }
    });

    const searchList = await repos.categories.getSearchCategoriesList();
    const categoryMap = {};
    searchList.forEach(category => {
        categoryMap[category.id] = category.name;
    });

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
 */
exports.getUserReviews = async (userId) => {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const orders = await repos.orders.findForUser(userId);

    if (orders.length === 0) {
        return { products: [] };
    }

    const orderIds = orders.map(order => order._id);
    const orderDetails = await repos.orderDetails.findForOrders(orderIds);

    const productIds = orderDetails.map(detail => detail.product_id);
    const productObjectIds = productIds.map(id => new mongoose.Types.ObjectId(id));

    const products = await repos.products.findByIdsForReviews(productObjectIds);

    const userReviews = await repos.reviews.findForUserByProducts(userObjectId, productObjectIds);

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
            ...product,
            user_review: userReview,
            order_details: orderData,
        };
    });

    return { products: productsWithReviews };
};

/**
 * Add or update a review for a product.
 */
exports.addReview = async (userId, { productId, name, description, title, qualityRating, valueRating, priceRating }, imagePath) => {
    let file = '';
    if (imagePath) {
        file = imagePath;
    }

    const existingReview = await repos.reviews.findOneForUserAndProduct(userId, productId);

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
        await repos.reviews.create({
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

    // Invalidate top-rated cache — new/updated review changes product ratings
    await cache.del(cache.key('catalog', 'top-rated', 'v1')).catch(() => {});

    const reviews = await repos.reviews.listAllProjected();
    const mappedReviews = reviews.map(r => ({
        ...r,
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

// ---------------------------------------------------------------------------
// Backward-compatibility alias (mobile authController still imports this name)
// ---------------------------------------------------------------------------
exports.getMobilePaymentHistory = exports.getTabbyBuyerHistory;

// ---------------------------------------------------------------------------
// V2 helpers
// ---------------------------------------------------------------------------

/**
 * Get lightweight profile for the current user.
 * Returns only fields needed by the profile screen — no order queries.
 */
exports.getProfile = async (userId) => {
    const user = await repos.users.findProfileFields(userId);

    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    const couponDoc = await repos.coupons.findByPhone(user.phone);
    const coupon = { data: couponDoc || [], status: !!couponDoc };

    return { user, coupon };
};

/**
 * Get total order count for a user, cached in Redis for 60 s.
 */
exports.getOrderCount = async (userId) => {
    const cacheKey = cache.key('orderCount', String(userId));
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
        return { count: Number(cached) };
    }

    const count = await repos.orders.countForUser(userId);

    await cache.set(cacheKey, String(count), 60);
    return { count };
};
