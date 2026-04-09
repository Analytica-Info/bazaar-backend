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
