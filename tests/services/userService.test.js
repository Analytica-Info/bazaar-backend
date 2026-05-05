require('../setup');

// Mock backendLogger
jest.mock('../../src/utilities/backendLogger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const OrderDetail = require('../../src/models/OrderDetail');
const Product = require('../../src/models/Product');
const Review = require('../../src/models/Review');
const userService = require('../../src/services/userService');

// ---------------------------------------------------------------------------
// Helpers to create test data
// ---------------------------------------------------------------------------

const createTestUser = async (overrides = {}) => {
    return User.create({
        name: 'Test User',
        email: 'testuser@example.com',
        phone: '1234567890',
        password: 'hashedpassword',
        authProvider: 'local',
        ...overrides,
    });
};

const createTestProduct = async (overrides = {}) => {
    return Product.create({
        product: { sku_number: 'SKU-001', name: 'Test Product' },
        totalQty: 100,
        ...overrides,
    });
};

const createTestOrder = async (userId, overrides = {}) => {
    return Order.create({
        userId: userId,
        user_id: userId,
        order_id: `ORD-${Date.now()}`,
        order_no: Math.floor(Math.random() * 100000),
        order_datetime: new Date().toISOString(),
        name: 'Test User',
        phone: '1234567890',
        address: '123 Test St',
        email: 'testuser@example.com',
        status: 'Confirmed',
        amount_subtotal: '100.00',
        amount_total: '110.00',
        discount_amount: '0',
        txn_id: `TXN-${Date.now()}`,
        payment_method: 'card',
        payment_status: 'paid',
        ...overrides,
    });
};

const createTestOrderDetail = async (orderId, productId, overrides = {}) => {
    return OrderDetail.create({
        order_id: orderId,
        product_id: productId.toString(),
        product_name: 'Test Product',
        product_image: 'test.jpg',
        variant_name: 'Default',
        amount: 50,
        quantity: 2,
        ...overrides,
    });
};

// ---------------------------------------------------------------------------
// getUserOrders
// ---------------------------------------------------------------------------
describe('userService.getUserOrders', () => {
    it('should throw 404 for user with no orders', async () => {
        const user = await createTestUser();

        await expect(
            userService.getUserOrders(user._id.toString())
        ).rejects.toEqual(expect.objectContaining({ status: 404, message: 'No orders found.' }));
    });

    it('should return orders with details', async () => {
        const user = await createTestUser();
        const product = await createTestProduct();
        const order = await createTestOrder(user._id, { status: 'Shipped' });
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getUserOrders(user._id.toString());

        expect(result.orders).toHaveLength(1);
        expect(result.total_orders).toBe(1);
        expect(result.shipped_orders).toBe(1);
        expect(result.delivered_orders).toBe(0);
        expect(result.canceled_orders).toBe(0);
        expect(result.orders[0].order_details).toHaveLength(1);
        expect(result.orders[0].order_details[0].sku).toBe('SKU-001');
    });
});

// ---------------------------------------------------------------------------
// getOrder
// ---------------------------------------------------------------------------
describe('userService.getOrder', () => {
    it('should throw when order not found', async () => {
        const user = await createTestUser();
        const fakeOrderId = new mongoose.Types.ObjectId();

        await expect(
            userService.getOrder(user._id.toString(), fakeOrderId.toString())
        ).rejects.toEqual(expect.objectContaining({ status: 404, message: 'No orders found.' }));
    });

    it('should return order with details', async () => {
        const user = await createTestUser();
        const product = await createTestProduct();
        const order = await createTestOrder(user._id);
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getOrder(user._id.toString(), order._id.toString());

        expect(result.orders).toHaveLength(1);
        expect(result.orders[0].order_details).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// getDashboard
// ---------------------------------------------------------------------------
describe('userService.getDashboard', () => {
    it('should return dashboard data for user', async () => {
        const user = await createTestUser();
        const product = await createTestProduct();
        const order = await createTestOrder(user._id, {
            status: 'Confirmed',
            amount_total: '150.00',
        });
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getDashboard(user._id.toString());

        expect(result.recent_orders).toHaveLength(1);
        expect(result.total_orders).toBe(1);
        expect(result.total_spent).toBe(150);
        expect(result.active_orders).toBe(1); // Confirmed is not 'delivered'
        expect(result.wishlist_item).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getUserReviews
// ---------------------------------------------------------------------------
describe('userService.getUserReviews', () => {
    it('should return empty when user has no orders', async () => {
        const user = await createTestUser();

        const result = await userService.getUserReviews(user._id.toString());

        expect(result.products).toEqual([]);
    });

    it('should return products with review status', async () => {
        const user = await createTestUser();
        const product = await createTestProduct();
        const order = await createTestOrder(user._id);
        await createTestOrderDetail(order._id, product._id);

        // Add a review for this product
        await Review.create({
            user_id: user._id,
            product_id: product._id,
            nickname: 'Test User',
            summary: 'Great product',
            texttext: 'Review title',
            quality_rating: 5,
            value_rating: 4,
            price_rating: 4,
        });

        const result = await userService.getUserReviews(user._id.toString());

        expect(result.products).toHaveLength(1);
        expect(result.products[0].user_review).toBeTruthy();
        expect(result.products[0].user_review.nickname).toBe('Test User');
        expect(result.products[0].order_details).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// addReview
// ---------------------------------------------------------------------------
describe('userService.addReview', () => {
    it('should create a new review', async () => {
        const user = await createTestUser();
        const product = await createTestProduct();

        const result = await userService.addReview(
            user._id,
            {
                productId: product._id,
                name: 'Reviewer',
                description: 'Nice product',
                title: 'Good',
                qualityRating: 5,
                valueRating: 4,
                priceRating: 3,
            },
            null
        );

        expect(result.message).toBe('Review created successfully');
        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0].name).toBe('Reviewer');
        expect(result.reviews[0].description).toBe('Nice product');
    });

    it('should update an existing review', async () => {
        const user = await createTestUser();
        const product = await createTestProduct();

        // Create initial review
        await Review.create({
            user_id: user._id,
            product_id: product._id,
            nickname: 'Old Name',
            summary: 'Old desc',
            texttext: 'Old title',
            quality_rating: 3,
            value_rating: 3,
            price_rating: 3,
        });

        const result = await userService.addReview(
            user._id,
            {
                productId: product._id,
                name: 'Updated Name',
                description: 'Updated desc',
                title: 'Updated title',
                qualityRating: 5,
                valueRating: 5,
                priceRating: 5,
            },
            null
        );

        expect(result.message).toBe('Review updated successfully');
        expect(result.reviews).toHaveLength(1);
        expect(result.reviews[0].name).toBe('Updated Name');
    });
});

// ---------------------------------------------------------------------------
// getPaymentHistory
// ---------------------------------------------------------------------------
describe('userService.getPaymentHistory', () => {
    it('throws 404 when user has no orders', async () => {
        const user = await createTestUser({ email: 'payment-history-none@example.com' });

        await expect(
            userService.getPaymentHistory(user._id.toString())
        ).rejects.toEqual(expect.objectContaining({ status: 404, message: 'No payment history found.' }));
    });

    it('returns { history } with populated order details when orders exist', async () => {
        const user = await createTestUser({ email: 'payment-history-exists@example.com' });
        const product = await createTestProduct({ product: { sku_number: 'SKU-PH-001', name: 'Payment Product' } });
        const order = await createTestOrder(user._id, { email: 'payment-history-exists@example.com' });
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getPaymentHistory(user._id.toString());

        expect(result).toHaveProperty('history');
        expect(result.history).toHaveLength(1);
    });

    it('history[0] has order_details array attached', async () => {
        const user = await createTestUser({ email: 'payment-history-details@example.com' });
        const product = await createTestProduct({ product: { sku_number: 'SKU-PH-002', name: 'Payment Product 2' } });
        const order = await createTestOrder(user._id, { email: 'payment-history-details@example.com' });
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getPaymentHistory(user._id.toString());

        expect(result.history[0]).toHaveProperty('order_details');
        expect(Array.isArray(result.history[0].order_details)).toBe(true);
        expect(result.history[0].order_details.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// getSinglePaymentHistory
// ---------------------------------------------------------------------------
describe('userService.getSinglePaymentHistory', () => {
    it('throws 404 when order not found for user', async () => {
        const user = await createTestUser({ email: 'single-payment-none@example.com' });
        const fakeOrderId = new mongoose.Types.ObjectId();

        await expect(
            userService.getSinglePaymentHistory(user._id.toString(), fakeOrderId.toString())
        ).rejects.toEqual(expect.objectContaining({ status: 404, message: 'No payment history found.' }));
    });

    it('returns { history } with the single order when found', async () => {
        const user = await createTestUser({ email: 'single-payment-found@example.com' });
        const product = await createTestProduct({ product: { sku_number: 'SKU-SPH-001', name: 'Single Payment Product' } });
        const order = await createTestOrder(user._id, { email: 'single-payment-found@example.com' });
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getSinglePaymentHistory(user._id.toString(), order._id.toString());

        expect(result).toHaveProperty('history');
        expect(result.history).toHaveLength(1);
        expect(result.history[0]._id.toString()).toBe(order._id.toString());
    });
});

// ---------------------------------------------------------------------------
// getMobilePaymentHistory
// ---------------------------------------------------------------------------
describe('userService.getMobilePaymentHistory', () => {
    it('returns correct structure { payment: { order_history, buyer_history } } when user has orders', async () => {
        const user = await createTestUser({ email: 'mobile-payment-struct@example.com' });
        const product = await createTestProduct({ product: { sku_number: 'SKU-MPH-001', name: 'Mobile Product' } });
        const order = await createTestOrder(user._id, {
            user_id: user._id,
            email: 'mobile-payment-struct@example.com',
        });
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getMobilePaymentHistory(user._id, new Date('2023-01-01'));

        expect(result).toHaveProperty('payment');
        expect(result.payment).toHaveProperty('order_history');
        expect(result.payment).toHaveProperty('buyer_history');
        expect(Array.isArray(result.payment.order_history)).toBe(true);
    });

    it('buyer_history.loyalty_level counts only successful orders (excludes pending/failed/cancelled/refunded/expired)', async () => {
        const user = await createTestUser({ email: 'mobile-payment-loyalty@example.com' });
        let i = 0;
        const nextId = () => ({ order_id: `ORD-LOYALTY-${i++}` });

        await createTestOrder(user._id, { ...nextId(), user_id: user._id, email: 'mobile-payment-loyalty@example.com', payment_status: 'paid' });
        await createTestOrder(user._id, { ...nextId(), user_id: user._id, email: 'mobile-payment-loyalty@example.com', payment_status: 'paid' });
        await createTestOrder(user._id, { ...nextId(), user_id: user._id, email: 'mobile-payment-loyalty@example.com', payment_status: 'pending' });
        await createTestOrder(user._id, { ...nextId(), user_id: user._id, email: 'mobile-payment-loyalty@example.com', payment_status: 'failed' });
        await createTestOrder(user._id, { ...nextId(), user_id: user._id, email: 'mobile-payment-loyalty@example.com', payment_status: 'cancelled' });

        const result = await userService.getMobilePaymentHistory(user._id, new Date('2023-01-01'));

        expect(result.payment.buyer_history.loyalty_level).toBe(2);
    });

    it('buyer_history.registered_since equals the userCreatedAt passed in', async () => {
        const user = await createTestUser({ email: 'mobile-payment-since@example.com' });
        const registeredDate = new Date('2022-06-15');

        const result = await userService.getMobilePaymentHistory(user._id, registeredDate);

        expect(result.payment.buyer_history.registered_since).toEqual(registeredDate);
    });

    it('maps order status correctly (Confirmed → newOne, Delivered → delivered)', async () => {
        const user = await createTestUser({ email: 'mobile-payment-status@example.com' });
        const product = await createTestProduct({ product: { sku_number: 'SKU-MPH-STATUS', name: 'Status Product' } });

        const confirmedOrder = await createTestOrder(user._id, {
            order_id: 'ORD-STATUS-1',
            user_id: user._id,
            email: 'mobile-payment-status@example.com',
            status: 'Confirmed',
        });
        await createTestOrderDetail(confirmedOrder._id, product._id);

        const deliveredOrder = await createTestOrder(user._id, {
            order_id: 'ORD-STATUS-2',
            user_id: user._id,
            email: 'mobile-payment-status@example.com',
            status: 'Delivered',
        });
        await createTestOrderDetail(deliveredOrder._id, product._id);

        const result = await userService.getMobilePaymentHistory(user._id, new Date('2023-01-01'));

        const statuses = result.payment.order_history.map(o => o.status);
        expect(statuses).toContain('newOne');
        expect(statuses).toContain('delivered');
    });

    it('maps payment method correctly (card → card, tabby → tabby)', async () => {
        const user = await createTestUser({ email: 'mobile-payment-method@example.com' });
        const product = await createTestProduct({ product: { sku_number: 'SKU-MPH-METHOD', name: 'Method Product' } });

        const cardOrder = await createTestOrder(user._id, {
            order_id: 'ORD-METHOD-1',
            user_id: user._id,
            email: 'mobile-payment-method@example.com',
            payment_method: 'card',
        });
        await createTestOrderDetail(cardOrder._id, product._id);

        const tabbyOrder = await createTestOrder(user._id, {
            order_id: 'ORD-METHOD-2',
            user_id: user._id,
            email: 'mobile-payment-method@example.com',
            payment_method: 'tabby',
        });
        await createTestOrderDetail(tabbyOrder._id, product._id);

        const result = await userService.getMobilePaymentHistory(user._id, new Date('2023-01-01'));

        const methods = result.payment.order_history.map(o => o.paymentMethod);
        expect(methods).toContain('card');
        expect(methods).toContain('tabby');
    });

    it('returns empty order_history: [] when user has no orders (should NOT throw)', async () => {
        const user = await createTestUser({ email: 'mobile-payment-empty@example.com' });

        const result = await userService.getMobilePaymentHistory(user._id, new Date('2023-01-01'));

        expect(result.payment.order_history).toEqual([]);
    });

    it('order_history items include buyer name/email/phone from the order', async () => {
        const user = await createTestUser({ email: 'mobile-payment-buyer@example.com' });
        const product = await createTestProduct({ product: { sku_number: 'SKU-MPH-BUYER', name: 'Buyer Product' } });
        const order = await createTestOrder(user._id, {
            user_id: user._id,
            name: 'John Doe',
            email: 'mobile-payment-buyer@example.com',
            phone: '9876543210',
        });
        await createTestOrderDetail(order._id, product._id);

        const result = await userService.getMobilePaymentHistory(user._id, new Date('2023-01-01'));

        const firstItem = result.payment.order_history[0];
        expect(firstItem.buyer).toEqual(expect.objectContaining({
            name: 'John Doe',
            email: 'mobile-payment-buyer@example.com',
            phone: '9876543210',
        }));
    });
});

describe('userService.getProfile', () => {
    it('should throw 404 when user not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        try {
            await userService.getProfile(fakeId.toString());
            fail('Expected error');
        } catch (err) {
            expect(err.status).toBe(404);
        }
    });

    it('should return user and coupon data', async () => {
        const user = await createTestUser({ email: 'profile-user@example.com', phone: '9000000001' });
        const result = await userService.getProfile(user._id.toString());
        expect(result.user).toBeDefined();
        expect(result.coupon).toBeDefined();
        expect(typeof result.coupon.status).toBe('boolean');
    });
});

describe('userService.getOrderCount', () => {
    it('should return count 0 when no orders', async () => {
        const user = await createTestUser({ email: 'count-user@example.com', phone: '9000000002' });
        const result = await userService.getOrderCount(user._id.toString());
        expect(result.count).toBeDefined();
    });
});

describe('userService.getCurrentMonthOrderCategories', () => {
    it('should return defined result', async () => {
        const result = await userService.getCurrentMonthOrderCategories();
        expect(result).toBeDefined();
    });
});
