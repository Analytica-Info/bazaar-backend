'use strict';

/**
 * Integration-style tests for src/services/order/use-cases/createStripeCheckoutSession.js
 *
 * Focuses on verifying that applyAutoCoupons is invoked after order creation.
 * All external dependencies (DB, email, coupon engine) are mocked.
 */

// --- coupon engine mock (must be hoisted before require) ---
jest.mock('../../../src/services/coupon', () => ({
    evaluateAuto: jest.fn().mockResolvedValue([]),
    apply: jest.fn(),
    redeemV2: jest.fn(),
    release: jest.fn(),
    checkCouponCode: jest.fn(),
    markCouponUsed: jest.fn(),
}));

// --- applyAutoCoupons spy ---
jest.mock('../../../src/services/order/domain/applyAutoCoupons', () => ({
    applyAutoCoupons: jest.fn().mockResolvedValue([]),
}));

// --- repository mocks ---
const mockOrderSave = jest.fn().mockResolvedValue(undefined);
const mockOrderDoc = { _id: { toString: () => 'order-111' }, orderTracks: [], save: mockOrderSave };
const mockOrderCreate = jest.fn().mockResolvedValue(mockOrderDoc);
const mockCartDataCreate = jest.fn().mockResolvedValue({ cartData: [] });
const mockOrderDetailInsertMany = jest.fn().mockResolvedValue([]);
const mockCouponMobileFindOneAndUpdate = jest.fn().mockResolvedValue(null);
const mockUserFindById = jest.fn().mockResolvedValue({ _id: 'user-111', name: 'Test', email: 'test@test.com' });
const mockCartFindOneAndDelete = jest.fn().mockResolvedValue(null);
const mockPendingPaymentCreate = jest.fn().mockResolvedValue({ _id: 'pp-111' });
const mockOrderFindOne = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) }) });

jest.mock('../../../src/repositories', () => ({
    orders: { rawModel: () => ({ create: mockOrderCreate, findOne: mockOrderFindOne }) },
    orderDetails: { rawModel: () => ({ insertMany: mockOrderDetailInsertMany }) },
    cartData: { rawModel: () => ({ create: mockCartDataCreate }) },
    carts: { rawModel: () => ({ findOneAndDelete: mockCartFindOneAndDelete }) },
    couponsMobile: { rawModel: () => ({ findOneAndUpdate: mockCouponMobileFindOneAndUpdate }) },
    users: { rawModel: () => ({ findById: mockUserFindById }) },
    pendingPayments: { rawModel: () => ({ create: mockPendingPaymentCreate }) },
}));

jest.mock('../../../src/utilities/activityLogger', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/utilities/backendLogger', () => ({ logBackendActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/mail/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/utilities/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../../src/utilities/cache', () => ({
    delPattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    key: jest.fn((...args) => args.join(':')),
}));
jest.mock('../../../src/utilities/clock', () => ({
    now: jest.fn().mockReturnValue(new Date('2024-01-01T10:00:00Z')),
}));
jest.mock('../../../src/config/runtime', () => ({
    order: { deliveryDays: 3 },
}));
jest.mock('../../../src/services/order/domain/cartNormalization', () => ({
    normalizeCartDataWithGifts: jest.fn(cart => cart),
    applyGiftLogic: jest.fn(async cart => cart),
}));
jest.mock('../../../src/services/order/domain/emailTemplates', () => ({
    buildAdminOrderEmailHtml: jest.fn().mockReturnValue('<html/>'),
    buildUserOrderEmailHtml: jest.fn().mockReturnValue('<html/>'),
}));
jest.mock('../../../src/services/order/shared/quantities', () => ({
    updateQuantities: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../src/services/order/use-cases/markCouponUsed', () => jest.fn().mockResolvedValue(undefined));

const { applyAutoCoupons } = require('../../../src/services/order/domain/applyAutoCoupons');
const createStripeCheckoutSession = require('../../../src/services/order/use-cases/createStripeCheckoutSession');

const BASE_BODY = {
    cartData: [{ product_id: 'p1', qty: 1, price: 50 }],
    shippingCost: 0,
    name: 'Test User',
    phone: '+971501234567',
    address: '123 Street',
    state: 'Dubai',
    city: 'Dubai',
    area: 'Downtown',
    floorNo: '1',
    buildingName: 'Tower A',
    apartmentNo: '101',
    landmark: null,
    currency: 'AED',
    discountPercent: 0,
    discountAmount: 0,
    couponCode: null,
    payment_method: 'cod',
    mobileNumber: '+971501234567',
    paymentIntentId: null,
    txnId: 'TXN123',
    paymentStatus: 'paid',
    user_email: 'test@test.com',
    total: 50,
    sub_total: 50,
};

describe('createStripeCheckoutSession — applyAutoCoupons integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOrderCreate.mockResolvedValue(mockOrderDoc);
        mockOrderDoc.orderTracks = [];
        mockOrderDoc.save = mockOrderSave;
        applyAutoCoupons.mockResolvedValue([]);
    });

    it('calls applyAutoCoupons after order is created with the order doc and cart', async () => {
        // Act
        await createStripeCheckoutSession('user-111', BASE_BODY, {});

        // Assert
        expect(applyAutoCoupons).toHaveBeenCalledTimes(1);
        expect(applyAutoCoupons).toHaveBeenCalledWith(expect.objectContaining({
            order: mockOrderDoc,
            user_id: 'user-111',
        }));
    });

    it('order creation succeeds even when applyAutoCoupons rejects', async () => {
        // Arrange
        applyAutoCoupons.mockRejectedValue(new Error('engine explosion'));

        // Act & Assert — should not throw
        await expect(createStripeCheckoutSession('user-111', BASE_BODY, {})).resolves.not.toThrow();
    });

    it('logs info when coupon results are returned', async () => {
        // Arrange
        const logger = require('../../../src/utilities/logger');
        applyAutoCoupons.mockResolvedValue([
            { redemption_id: 'r1', coupon_code: 'AUTO10', discount_aed: 10, status: 'redeemed' },
        ]);

        // Act
        await createStripeCheckoutSession('user-111', BASE_BODY, {});

        // Assert
        expect(logger.info).toHaveBeenCalledWith(
            expect.objectContaining({ coupon_count: 1 }),
            'auto-coupons applied to order'
        );
    });
});
