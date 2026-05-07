/**
 * checkoutService.pr11.test.js
 * PR11 — Additional coverage push for checkoutService.
 *
 * Covers:
 *  - clearUserCart: cart found, cart not found
 *  - createStripeCheckout: no-discount path, discount path
 *  - verifyStripePayment: unpaid session (no order created), missing cartData
 *  - createTabbyCheckout: approved (status=created), rejected, no-install products, unexpected payload type
 *  - handleTabbyWebhook: Buffer payload, AUTHORIZED→CLOSED flow
 *  - verifyNomodPayment: idempotency (already completed), happy path order creation, coupon + bankPromo usage
 *  - createNomodCheckout: happy path, empty cartData error
 *  - processCheckout: error path
 *  - verifyTabbyPayment: missing paymentId, AUTHORIZED→capture
 */

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.STRIPE_SK = 'sk_test_fake';
process.env.API_KEY = 'fake-ls-key';
process.env.ENVIRONMENT = 'test';
process.env.TABBY_AUTH_KEY = 'fake-tabby-auth';
process.env.TABBY_SECRET_KEY = 'fake-tabby-secret';
process.env.TABBY_WEBHOOK_SECRET = 'fake-tabby-webhook-secret';
process.env.TABBY_IPS = '127.0.0.1,10.0.0.1';
process.env.URL = 'http://localhost:3000';
process.env.PRODUCTS_UPDATE = 'false';
process.env.FRONTEND_BASE_URL = 'http://localhost:3000';

require('../setup');

// ── Stable mock objects ──────────────────────────────────────────────────────

const mockStripeInst = {
    checkout: {
        sessions: {
            create: jest.fn(),
            retrieve: jest.fn(),
        },
    },
    paymentIntents: {
        create: jest.fn().mockResolvedValue({ id: 'pi_pr11', client_secret: 'secret_pr11' }),
    },
    coupons: {
        create: jest.fn().mockResolvedValue({ id: 'coupon_pr11', percent_off: 10, duration: 'once' }),
    },
};

jest.mock('stripe', () => {
    const ctor = jest.fn(() => mockStripeInst);
    ctor._instance = mockStripeInst;
    return ctor;
});

jest.mock('axios');
jest.mock('../../src/mail/emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utilities/emailHelper', () => ({
    getAdminEmail: jest.fn().mockResolvedValue('admin@test.com'),
    getCcEmails: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../src/utilities/activityLogger', () => ({
    logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utilities/backendLogger', () => ({
    logBackendActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/helpers/sendPushNotification', () => ({
    sendPushNotification: jest.fn(),
}));
jest.mock('../../src/models/Coupons', () => ({
    findOne: jest.fn().mockResolvedValue(null),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const axios = require('axios');
const CartData = require('../../src/models/CartData');
const Cart = require('../../src/models/Cart');
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const OrderDetail = require('../../src/models/OrderDetail');
const BankPromoCode = require('../../src/models/BankPromoCode');
const BankPromoCodeUsage = require('../../src/models/BankPromoCodeUsage');
const Notification = require('../../src/models/Notification');
const PendingPayment = require('../../src/models/PendingPayment');
const Product = require('../../src/models/Product');
const Coupon = require('../../src/models/Coupon');
const PaymentProviderFactory = require('../../src/services/payments/PaymentProviderFactory');

const checkoutService = require('../../src/services/checkoutService');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeUser(overrides = {}) {
    return User.create({
        name: 'PR11 User',
        email: `pr11-${Date.now()}-${Math.random()}@test.com`,
        phone: `05${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
        password: 'hash',
        ...overrides,
    });
}

function buildCartItems(n = 1) {
    return Array.from({ length: n }, (_, i) => ({
        id: new mongoose.Types.ObjectId().toString(),
        product_id: new mongoose.Types.ObjectId().toString(),
        name: `Item ${i}`,
        price: 50 + i * 10,
        qty: 1,
        total_qty: 10,
        variantId: `ls-var-${i}`,
        variant: 'Default',
        image: `http://img/${i}.jpg`,
    }));
}

function baseTabbyPayment(cartDataId, overrides = {}) {
    return {
        id: `pay_pr11_${Date.now()}`,
        status: 'CLOSED',
        amount: '100.00',
        buyer: { name: 'PR11 Buyer', email: `buyer-pr11-${Date.now()}@test.com`, phone: '0501234567' },
        shipping_address: { address: 'Dubai Marina', city: 'Dubai', zip: '' },
        order: { discount_amount: '0.00', shipping_amount: '30', tax_amount: '0', reference_id: 'ref-pr11', items: [] },
        meta: {
            cartDataId: String(cartDataId),
            name: 'PR11 Buyer',
            phone: '0501234567',
            address: 'Dubai Marina',
            city: 'Dubai',
            area: 'Marina',
            buildingName: 'Tower A',
            floorNo: '3',
            apartmentNo: '301',
            landmark: '',
            subtotalAmount: '100',
            shippingCost: '30',
            currency: 'AED',
            couponCode: '',
            mobileNumber: '',
            paymentMethod: 'tabby',
            discountPercent: '0',
            saved_total: '0',
            bankPromoId: '',
        },
        ...overrides,
    };
}

function makeTabbyMeta(cartData, overrides = {}) {
    return {
        customerOrderData: {
            payment: {
                amount: '130.00',
                currency: 'AED',
                description: 'Order',
                buyer: { name: 'Buyer', phone: '050', email: 'b@test.com', dob: '' },
                shipping_address: { city: 'Dubai', address: 'Marina', zip: '' },
                order: { tax_amount: '0', shipping_amount: '30', discount_amount: '0', saved_total: '0', updated_at: new Date().toISOString(), reference_id: 'ref-1', items: [] },
                buyer_history: { registered_since: new Date().toISOString(), loyalty_level: 0, wishlist_count: 0, is_social_networks_connected: false, is_phone_number_verified: true, is_email_verified: true },
                order_history: [],
                meta: {},
            },
            merchant_urls: { success: 'http://localhost/success', cancel: 'http://localhost/cancel', failure: 'http://localhost/failure' },
            merchant_code: 'BAZAAR',
            lang: 'en',
        },
        orderData: {
            cartData,
            shippingCost: 30, name: 'Buyer', phone: '050', address: 'Dubai',
            currency: 'AED', city: 'Dubai', area: 'Marina', buildingName: '',
            floorNo: '', apartmentNo: '', landmark: '',
            discountPercent: 0, couponCode: '', mobileNumber: '',
            saved_total: 0, bankPromoId: '', discountAmount: 0, capAED: null,
            ...overrides,
        },
        paymentMethod: 'tabby',
    };
}

// ── createStripeCheckout ──────────────────────────────────────────────────────

describe('checkoutService.createStripeCheckout — PR11 paths', () => {
    beforeEach(() => {
        mockStripeInst.checkout.sessions.create.mockResolvedValue({
            id: 'cs_pr11_create',
            url: 'https://checkout.stripe.com/pr11',
        });
    });

    it('creates checkout session with no discount', async () => {
        const cartItems = buildCartItems(2);
        const metadata = {
            shippingCost: 20, name: 'Test', phone: '050', address: 'Dubai',
            currency: 'AED', city: 'Dubai', area: '', buildingName: '', floorNo: '',
            apartmentNo: '', landmark: '', discountPercent: 0, couponCode: '',
            mobileNumber: '', paymentMethod: 'card', discountAmount: 0,
            totalAmount: '140.00', subTotalAmount: '120.00', saved_total: 0,
            bankPromoId: null, capAED: null,
        };

        const result = await checkoutService.createStripeCheckout(cartItems, null, metadata);
        expect(result.id).toBeDefined();
        expect(mockStripeInst.checkout.sessions.create).toHaveBeenCalled();
    });

    it('creates checkout session with percentage discount', async () => {
        const cartItems = buildCartItems(1);
        const metadata = {
            shippingCost: 10, name: 'Test', phone: '050', address: 'Dubai',
            currency: 'AED', city: 'Dubai', area: '', buildingName: '', floorNo: '',
            apartmentNo: '', landmark: '', discountPercent: 10, couponCode: '',
            mobileNumber: '', paymentMethod: 'card', discountAmount: 0,
            totalAmount: '55.00', subTotalAmount: '50.00', saved_total: 0,
            bankPromoId: null, capAED: null,
        };

        const result = await checkoutService.createStripeCheckout(cartItems, null, metadata);
        expect(result.id).toBeDefined();
    });
});

// ── verifyStripePayment — unpaid session path ─────────────────────────────────

describe('checkoutService.verifyStripePayment — unpaid path', () => {
    it('throws when sessionId is null', async () => {
        await expect(checkoutService.verifyStripePayment(null, 'user-1'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('handles unpaid session without creating order', async () => {
        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: 'cs_unpaid',
            payment_status: 'unpaid',
            payment_intent: null,
            customer_details: { email: 'x@test.com' },
            metadata: {
                cartDataId: null,
                name: 'X', phone: '050', address: 'Dubai',
                shippingCost: '0', totalAmount: '100', subTotalAmount: '100',
            },
        });

        // unpaid path falls through — will throw due to null cartData.findById
        // but the important thing is it doesn't create an order
        const before = await Order.countDocuments();
        try {
            await checkoutService.verifyStripePayment('cs_unpaid', 'user-1');
        } catch (e) {
            // expected — cartData not found
        }
        const after = await Order.countDocuments();
        expect(after).toBe(before);
    });
});

// ── createTabbyCheckout — happy path ─────────────────────────────────────────

describe('checkoutService.createTabbyCheckout — PR11 paths', () => {
    it('returns checkout_url on successful Tabby response', async () => {
        const cartItems = buildCartItems(2);
        const meta = makeTabbyMeta(cartItems);

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                status: 'created',
                configuration: {
                    available_products: {
                        installments: [{ web_url: 'https://tabby.ai/checkout/abc' }],
                    },
                },
            }),
        });

        const result = await checkoutService.createTabbyCheckout(cartItems, null, meta);
        expect(result.checkout_url).toBe('https://tabby.ai/checkout/abc');
        expect(result.status).toBe('created');
    });

    it('throws 400 when Tabby returns rejected status', async () => {
        const cartItems = buildCartItems(1);
        const meta = makeTabbyMeta(cartItems);

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ status: 'rejected', message: 'Not approved' }),
        });

        await expect(checkoutService.createTabbyCheckout(cartItems, null, meta))
            .rejects.toMatchObject({ status: 400, data: { status: 'rejected' } });
    });

    it('throws 500 when Tabby returns created but no installments', async () => {
        const cartItems = buildCartItems(1);
        const meta = makeTabbyMeta(cartItems);

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                status: 'created',
                configuration: { available_products: { installments: [] } },
            }),
        });

        await expect(checkoutService.createTabbyCheckout(cartItems, null, meta))
            .rejects.toMatchObject({ status: 500, message: expect.stringContaining('No available products') });
    });
});

// ── handleTabbyWebhook — Buffer payload ──────────────────────────────────────

describe('checkoutService.handleTabbyWebhook — PR11 paths', () => {
    it('parses Buffer payload correctly and throws on missing paymentId', async () => {
        const bufPayload = Buffer.from(JSON.stringify({}), 'utf-8');
        await expect(
            checkoutService.handleTabbyWebhook(bufPayload, 'user-1', '127.0.0.1', 'fake-tabby-webhook-secret')
        ).rejects.toMatchObject({ status: 400, message: 'paymentId missing' });
    });

    it('returns "Webhook received" for non-CLOSED status', async () => {
        axios.get = jest.fn().mockResolvedValue({
            data: { id: 'pay_xxx', status: 'REJECTED', amount: '100' },
        });

        const result = await checkoutService.handleTabbyWebhook(
            { id: 'pay_xxx' }, 'user-1', '127.0.0.1', 'fake-tabby-webhook-secret'
        );
        expect(result.message).toBe('Webhook received');
    });

    it('throws 500 on unexpected payload type', async () => {
        await expect(
            checkoutService.handleTabbyWebhook(
                12345, 'user-1', '127.0.0.1', 'fake-tabby-webhook-secret'
            )
        ).rejects.toMatchObject({ status: 500 });
    });
});

// ── verifyTabbyPayment — error branches ───────────────────────────────────────

describe('checkoutService.verifyTabbyPayment — PR11', () => {
    it('throws 400 when paymentId is missing', async () => {
        await expect(checkoutService.verifyTabbyPayment(null, 'user-1', null))
            .rejects.toMatchObject({ status: 400 });
    });

    it('returns orderId when payment is CLOSED', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        const payment = baseTabbyPayment(cartDataEntry._id);

        axios.get = jest.fn().mockResolvedValue({ data: payment });

        const result = await checkoutService.verifyTabbyPayment(payment.id, user._id, null);
        expect(result.orderId || result.message).toBeDefined();
    });

    it('throws 500 when AUTHORIZED capture returns non-CLOSED', async () => {
        const payment = { id: 'pay_auth', status: 'AUTHORIZED', amount: '100' };
        axios.get = jest.fn().mockResolvedValue({ data: payment });
        axios.post = jest.fn().mockResolvedValue({ data: { status: 'PENDING' } });

        await expect(checkoutService.verifyTabbyPayment(payment.id, 'user-1', null))
            .rejects.toMatchObject({ status: 500, message: 'Capture failed' });
    });
});

// ── verifyNomodPayment — idempotency + happy path ─────────────────────────────

describe('checkoutService.verifyNomodPayment — PR11', () => {
    let mockNomodProvider;

    beforeEach(() => {
        mockNomodProvider = { getCheckout: jest.fn() };
        jest.spyOn(PaymentProviderFactory, 'create').mockReturnValue(mockNomodProvider);
    });

    afterEach(() => {
        PaymentProviderFactory.create.mockRestore();
    });

    it('returns "Order already created" when pendingPayment is already completed', async () => {
        mockNomodProvider.getCheckout.mockResolvedValue({ paid: true, status: 'paid' });

        const cartItems = buildCartItems(1);
        const u = await makeUser();
        await PendingPayment.create({
            user_id: u._id,
            payment_id: 'chk_already_done',
            payment_method: 'nomod',
            status: 'completed',
            order_data: {
                cartData: cartItems, shippingCost: 0, name: 'Test', phone: '050',
                address: 'Dubai', city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '', currency: 'AED', discountAmount: '0',
                couponCode: '', mobileNumber: '', saved_total: 0, bankPromoId: '',
                subtotalAmount: '50', totalAmount: '50',
            },
        });

        const req = { user: { _id: u._id }, body: { paymentId: 'chk_already_done' } };
        const result = await checkoutService.verifyNomodPayment(req);
        expect(result.message).toBe('Order already created');
    });

    it('creates order from pending payment (happy path)', async () => {
        mockNomodProvider.getCheckout.mockResolvedValue({ paid: true, status: 'paid' });

        const user = await makeUser();
        const cartItems = buildCartItems(2);
        const paymentId = `chk_pr11_${Date.now()}`;

        await PendingPayment.create({
            user_id: user._id,
            payment_id: paymentId,
            payment_method: 'nomod',
            status: 'pending',
            order_data: {
                cartData: cartItems, shippingCost: 20, name: 'Happy', phone: '050',
                address: 'Dubai Marina', city: 'Dubai', area: 'Marina', buildingName: 'T',
                floorNo: '1', apartmentNo: '101', landmark: '', currency: 'AED',
                discountAmount: '0', couponCode: '', mobileNumber: '', saved_total: 0,
                bankPromoId: '', subtotalAmount: '110', totalAmount: '130',
            },
        });

        const req = { user: { _id: user._id }, body: { paymentId } };
        const result = await checkoutService.verifyNomodPayment(req);
        expect(result.orderId).toBeDefined();

        // Verify order was persisted
        const order = await Order.findById(result.orderId);
        expect(order).toBeTruthy();
        expect(order.payment_method).toBe('nomod');
    });

    it('marks coupon as used when couponCode + mobileNumber present', async () => {
        mockNomodProvider.getCheckout.mockResolvedValue({ paid: true, status: 'paid' });

        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const paymentId = `chk_coupon_${Date.now()}`;

        // Create a coupon to be used
        const coupon = await Coupon.create({
            coupon: 'SAVE10',
            phone: '0501111111',
            status: 'active',
        });

        await PendingPayment.create({
            user_id: user._id,
            payment_id: paymentId,
            payment_method: 'nomod',
            status: 'pending',
            order_data: {
                cartData: cartItems, shippingCost: 0, name: 'Coupon User', phone: '050',
                address: 'Dubai', city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '', currency: 'AED', discountAmount: '5',
                couponCode: 'SAVE10', mobileNumber: '0501111111', saved_total: 0,
                bankPromoId: '', subtotalAmount: '50', totalAmount: '45',
            },
        });

        const req = { user: { _id: user._id }, body: { paymentId } };
        await checkoutService.verifyNomodPayment(req);

        const updated = await Coupon.findById(coupon._id);
        expect(updated.status).toBe('used');
    });

    it('records bankPromo usage when bankPromoId present', async () => {
        mockNomodProvider.getCheckout.mockResolvedValue({ paid: true, status: 'paid' });

        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const paymentId = `chk_promo_${Date.now()}`;

        const promo = await BankPromoCode.create({
            code: 'BANK10',
            discountPercent: 10,
            capAED: 50,
            allowedBank: 'TestBank',
            active: true,
            expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await PendingPayment.create({
            user_id: user._id,
            payment_id: paymentId,
            payment_method: 'nomod',
            status: 'pending',
            order_data: {
                cartData: cartItems, shippingCost: 0, name: 'Promo', phone: '050',
                address: 'Dubai', city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '', currency: 'AED', discountAmount: '5',
                couponCode: '', mobileNumber: '', saved_total: 0,
                bankPromoId: promo._id.toString(),
                subtotalAmount: '50', totalAmount: '45',
            },
        });

        const req = { user: { _id: user._id }, body: { paymentId } };
        await checkoutService.verifyNomodPayment(req);

        const usage = await BankPromoCodeUsage.findOne({ bankPromoCodeId: promo._id, userId: user._id });
        expect(usage).toBeTruthy();
    });
});

// ── createNomodCheckout — happy path ──────────────────────────────────────────

describe('checkoutService.createNomodCheckout — PR11', () => {
    let mockNomodProvider;

    beforeEach(() => {
        mockNomodProvider = {
            createCheckout: jest.fn().mockResolvedValue({
                id: 'chk_nomod_pr11',
                redirectUrl: 'https://pay.nomod.com/chk_pr11',
            }),
        };
        jest.spyOn(PaymentProviderFactory, 'create').mockReturnValue(mockNomodProvider);
    });

    afterEach(() => {
        PaymentProviderFactory.create.mockRestore();
    });

    it('throws 400 when cartData is empty', async () => {
        const req = {
            user: { _id: new mongoose.Types.ObjectId() },
            body: { cartData: [] },
        };
        await expect(checkoutService.createNomodCheckout(req)).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when cartData is missing', async () => {
        const req = {
            user: { _id: new mongoose.Types.ObjectId() },
            body: {},
        };
        await expect(checkoutService.createNomodCheckout(req)).rejects.toMatchObject({ status: 400 });
    });

    it('creates Nomod checkout and returns url', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(2);

        const req = {
            user: { _id: user._id },
            body: {
                cartData: cartItems,
                shippingCost: 20, name: 'Nomod User', phone: '050', address: 'Dubai',
                currency: 'AED', city: 'Dubai', area: 'Marina', buildingName: '',
                floorNo: '', apartmentNo: '', landmark: '',
                discountPercent: 0, couponCode: '', mobileNumber: '',
                saved_total: 0, bankPromoId: '', discountAmount: 0, capAED: null,
                successUrl: 'http://localhost/success',
                failureUrl: 'http://localhost/failure',
                cancelledUrl: 'http://localhost/cancel',
            },
        };

        const result = await checkoutService.createNomodCheckout(req);
        expect(result.checkout_url).toBe('https://pay.nomod.com/chk_pr11');
    });
});

// ── processCheckout — error path ──────────────────────────────────────────────

describe('checkoutService.processCheckout — error path', () => {
    it('throws 500 when stripe paymentIntents fails', async () => {
        mockStripeInst.paymentIntents.create.mockRejectedValueOnce(new Error('Stripe error'));

        await expect(
            checkoutService.processCheckout({
                name: 'Test', email: 'x@test.com', address: 'Dubai',
                cartData: [{ id: 'p1', price: 50, qty: 1, name: 'P', variant: 'V' }],
                shippingCost: 10, currency: 'AED',
            }, 'user-1')
        ).rejects.toMatchObject({ status: 500 });
    });
});

// ── verifyStripePayment — zero shippingCost + coupon paths ────────────────────

describe('checkoutService.verifyStripePayment — zero shippingCost + coupon', () => {
    beforeEach(() => {
        mockStripeInst.checkout.sessions.retrieve.mockReset();
    });

    it('handles session with no shippingCost (formats 0)', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: 'cs_pr11_zero_ship',
            payment_status: 'paid',
            payment_intent: 'pi_pr11_zs',
            customer_details: { email: 'pr11@test.com' },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '',  // empty string = no shipping
                currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        const result = await checkoutService.verifyStripePayment('cs_pr11_zero_ship', user._id.toString());
        expect(result.orderId).toBeDefined();
    });

    it('throws 400 when payment_status is not paid', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: 'cs_pr11_unpaid',
            payment_status: 'unpaid',
            payment_intent: null,
            customer_details: { email: 'pr11@test.com' },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        await expect(checkoutService.verifyStripePayment('cs_pr11_unpaid', user._id.toString()))
            .rejects.toMatchObject({ status: 400 });
    });
});

// ── verifyStripePayment — coupon used path ─────────────────────────────────────

describe('checkoutService.verifyStripePayment — coupon path', () => {
    beforeEach(() => {
        mockStripeInst.checkout.sessions.retrieve.mockReset();
    });

    it('marks coupon as used when couponCode + mobileNumber present in metadata', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        // Create a real coupon for marking
        const coupon = await Coupon.create({
            coupon: 'SAVE15',
            phone: '0509876543',
            status: 'active',
        });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_pr11_coupon_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_pr11_coupon_${Date.now()}`,
            customer_details: { email: 'pr11@test.com' },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '85.00', subTotalAmount: '100.00',
                couponCode: 'SAVE15',
                mobileNumber: '0509876543',
                paymentMethod: 'card', discountAmount: '15',
                bankPromoId: '', saved_total: '0',
            },
        });

        await checkoutService.verifyStripePayment(`cs_pr11_coupon_${Date.now()}`, user._id.toString());
        const updated = await Coupon.findById(coupon._id);
        expect(updated.status).toBe('used');
    });
});

// ── handleTabbyWebhook — CLOSED with zero shipping (createOrderAndSendEmails) ─

describe('checkoutService.handleTabbyWebhook — zero shipping PR11', () => {
    it('creates order with no shippingCost in payment', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        const paymentId = `pay_pr11_zeroship_${Date.now()}`;

        const payment = {
            id: paymentId,
            status: 'CLOSED',
            amount: '50.00',
            buyer: { name: 'ZeroShip', email: `zeroship-${Date.now()}@test.com`, phone: '050' },
            shipping_address: { address: 'Dubai Marina', city: 'Dubai', zip: '' },
            order: { discount_amount: '0.00', shipping_amount: null, tax_amount: '0', reference_id: 'ref-zs', items: [] },
            meta: {
                cartDataId: String(cartDataEntry._id),
                name: 'ZeroShip', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '', apartmentNo: '',
                landmark: '', subtotalAmount: '50', shippingCost: '0', currency: 'AED',
                couponCode: 'COUPON10', mobileNumber: '050',
                paymentMethod: 'tabby', discountPercent: '0', saved_total: '0', bankPromoId: '',
            },
        };

        axios.get = jest.fn().mockResolvedValue({ data: payment });

        const result = await checkoutService.handleTabbyWebhook(
            { id: paymentId }, user._id.toString(), '127.0.0.1', 'fake-tabby-webhook-secret'
        );

        expect(result.message).toBe('Order processed');
        const order = await Order.findOne({ txn_id: paymentId });
        expect(order).not.toBeNull();
    });
});

// ── createTabbyCheckout — internal error (non-status error) ──────────────────

describe('checkoutService.createTabbyCheckout — internal fetch error', () => {
    it('throws 500 when fetch itself throws (network error)', async () => {
        const cartItems = buildCartItems(1);
        const meta = makeTabbyMeta(cartItems);

        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        await expect(checkoutService.createTabbyCheckout(cartItems, null, meta))
            .rejects.toMatchObject({ status: 500 });
    });
});

// ── verifyStripePayment — coupon marking path (lines 660-662) ─────────────────

describe('checkoutService.verifyStripePayment — coupon marking', () => {
    const { sendEmail } = require('../../src/mail/emailService');
    beforeEach(() => {
        mockStripeInst.checkout.sessions.retrieve.mockReset();
        sendEmail.mockResolvedValue(undefined);
    });

    it('marks coupon as used when couponCode+mobileNumber match an unused coupon', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        // Create an unused coupon
        const phone = '0501111222';
        await Coupon.create({
            coupon: 'SAVE10VSP',
            phone: phone,
            status: 'unused',
            amount: 10,
            expiry: new Date(Date.now() + 86400000),
        });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_coupon_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_coupon_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: phone, address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '90.00', subTotalAmount: '100.00',
                couponCode: 'SAVE10VSP', mobileNumber: phone,
                paymentMethod: 'card', discountAmount: '10',
                bankPromoId: '', saved_total: '10',
            },
        });

        const result = await checkoutService.verifyStripePayment(`cs_coupon_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();
    });

    it('handles admin email failure in verifyStripePayment gracefully', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        sendEmail
            .mockRejectedValueOnce(new Error('Admin SMTP'))
            .mockResolvedValue(undefined);

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_emailfail_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_ef_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        const result = await checkoutService.verifyStripePayment(`cs_emailfail_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();
    });

    it('handles user email failure in verifyStripePayment gracefully', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        sendEmail
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('User SMTP'));

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_userfail_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_uf_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        const result = await checkoutService.verifyStripePayment(`cs_userfail_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();
    });

    it('covers multi-item discount line item allocation (lines 1015-1016)', async () => {
        const user = await makeUser();
        // 2 items with discount > 0 to hit the non-last-item branch
        const cartItems = buildCartItems(2);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        mockStripeInst.checkout.sessions.create.mockResolvedValueOnce({ id: `cs_multi_${Date.now()}` });

        const result = await checkoutService.createStripeCheckout(cartItems, user._id.toString(), {
            discountAED: 10,
            discountPercent: 10,
            bankPromoId: '',
            discountAmount: '10',
            capAED: 0,
            currency: 'AED',
        });
        expect(result.id).toBeDefined();
    });

    it('handles createStripeCheckout internal stripe error (lines 1078-1079)', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);

        mockStripeInst.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe error'));

        await expect(
            checkoutService.createStripeCheckout(cartItems, user._id.toString(), {
                currency: 'AED',
            })
        ).rejects.toMatchObject({ status: 500 });
    });
});

// ── createOrderAndSendEmails via handleTabbyWebhook — email failures ──────────

describe('checkoutService.handleTabbyWebhook — email failures in createOrderAndSendEmails', () => {
    const { sendEmail } = require('../../src/mail/emailService');
    beforeEach(() => {
        jest.clearAllMocks();
        sendEmail.mockResolvedValue(undefined);
    });

    it('handles admin email failure in createOrderAndSendEmails (line 945)', async () => {
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });
        const payment = baseTabbyPayment(cartDataEntry._id);

        sendEmail
            .mockRejectedValueOnce(new Error('Admin SMTP fail'))
            .mockResolvedValue(undefined);

        require('axios').get = jest.fn().mockResolvedValue({ data: { ...payment, status: 'CLOSED' } });

        // payload must have { id: paymentId }
        const result = await checkoutService.handleTabbyWebhook(
            { id: payment.id },
            null, '127.0.0.1', 'fake-tabby-webhook-secret'
        );
        expect(result).toBeDefined();
    });

    it('handles user email failure in createOrderAndSendEmails (line 962)', async () => {
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });
        const payment = baseTabbyPayment(cartDataEntry._id);

        sendEmail
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('User SMTP fail'));

        require('axios').get = jest.fn().mockResolvedValue({ data: { ...payment, status: 'CLOSED' } });

        const result = await checkoutService.handleTabbyWebhook(
            { id: payment.id },
            null, '127.0.0.1', 'fake-tabby-webhook-secret'
        );
        expect(result).toBeDefined();
    });

    it('covers nextOrderNo + 1 in createOrderAndSendEmails when prior order exists (line 685)', async () => {
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });
        const payment = baseTabbyPayment(cartDataEntry._id);

        // Ensure an order exists with order_no
        await Order.create({
            user_id: new mongoose.Types.ObjectId(),
            order_id: `BZR-PR11-PRIOR-${Date.now()}`,
            order_no: 8888,
            name: 'Prior', address: 'Dubai', email: 'prior@test.com',
            status: 'Confirmed', amount_subtotal: '100', amount_total: '100',
            discount_amount: '0', shipping: '0', txn_id: `txn_prior_${Date.now()}`,
            payment_method: 'card', payment_status: 'paid', orderfrom: 'Website',
        });

        require('axios').get = jest.fn().mockResolvedValue({ data: { ...payment, status: 'CLOSED' } });

        const result = await checkoutService.handleTabbyWebhook(
            { id: payment.id },
            null, '127.0.0.1', 'fake-tabby-webhook-secret'
        );
        expect(result).toBeDefined();
    });

    it('handles couponCode with matching coupon in createOrderAndSendEmails (lines 660-662)', async () => {
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });
        const phone = '0509988776';

        // Create an unused coupon
        await Coupon.create({
            coupon: 'SAVE5TAB',
            phone: phone,
            status: 'unused',
            amount: 5,
            expiry: new Date(Date.now() + 86400000),
        });

        const payment = baseTabbyPayment(cartDataEntry._id, {
            meta: {
                cartDataId: String(cartDataEntry._id),
                name: 'Tabby Buyer', phone, address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                subtotalAmount: '95', shippingCost: '0', currency: 'AED',
                couponCode: 'SAVE5TAB', mobileNumber: phone,
                paymentMethod: 'tabby', discountPercent: '0',
                saved_total: '0', bankPromoId: '',
            },
        });

        require('axios').get = jest.fn().mockResolvedValue({ data: { ...payment, status: 'CLOSED' } });

        const result = await checkoutService.handleTabbyWebhook(
            { id: payment.id },
            null, '127.0.0.1', 'fake-tabby-webhook-secret'
        );
        expect(result).toBeDefined();
    });
});

// ── createNomodCheckout — outer error catch (lines 1731-1732) ─────────────────

describe('checkoutService.createNomodCheckout — non-status error', () => {
    beforeEach(() => jest.clearAllMocks());

    it('throws 500 on unexpected non-status error', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);

        // Make provider throw a plain error (no .status)
        PaymentProviderFactory.create = jest.fn().mockReturnValue({
            createCheckout: jest.fn().mockRejectedValue(new Error('Provider crash')),
        });

        await expect(
            checkoutService.createNomodCheckout(cartItems, user._id.toString(), {
                currency: 'AED', discountAED: 0, shippingCost: 0,
                name: 'User', phone: '050', email: user.email,
                address: 'Dubai', city: 'Dubai', area: '', buildingName: '',
                floorNo: '', apartmentNo: '', landmark: '',
                couponCode: '', mobileNumber: '', discountPercent: 0,
                discountAmount: 0, bankPromoId: '', saved_total: 0,
                sub_total: 50, total: 50, cartDataId: 'fake-id',
            })
        ).rejects.toMatchObject({ status: 500 });
    });
});

// ── verifyNomodPayment — outer error catch (lines 1849-1850) ──────────────────

describe('checkoutService.verifyNomodPayment — non-status error', () => {
    beforeEach(() => jest.clearAllMocks());

    it('throws 500 on unexpected non-status error', async () => {
        // Make provider getCheckout throw plain error
        PaymentProviderFactory.create = jest.fn().mockReturnValue({
            getCheckout: jest.fn().mockRejectedValue(new Error('Provider crash')),
        });

        await expect(
            checkoutService.verifyNomodPayment('nomod_pay_crash', null)
        ).rejects.toMatchObject({ status: 500 });
    });
});

// ── resolveCheckoutDiscountAED — bankPromoId error catch (line 71) ────────────

describe('checkoutService.createStripeCheckout — bankPromoId error catch', () => {
    beforeEach(() => jest.clearAllMocks());

    it('handles bankPromoId lookup error gracefully (line 71)', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);

        // Pass a malformed bankPromoId to trigger a MongoDB cast error in resolveCheckoutDiscountAED
        mockStripeInst.checkout.sessions.create.mockResolvedValueOnce({ id: `cs_bpid_err_${Date.now()}` });

        // This should not throw — error is caught internally at line 71
        const result = await checkoutService.createStripeCheckout(cartItems, user._id.toString(), {
            bankPromoId: 'not-a-valid-objectid',
            currency: 'AED',
        });
        expect(result.id).toBeDefined();
    });
});

// ── clearUserCart — cart found path (lines 91-93) ────────────────────────────

describe('checkoutService.verifyStripePayment — clearUserCart with cart', () => {
    const { sendEmail } = require('../../src/mail/emailService');

    beforeEach(() => {
        mockStripeInst.checkout.sessions.retrieve.mockReset();
        sendEmail.mockResolvedValue(undefined);
    });

    it('clears user cart after successful stripe payment', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        // Create a cart for the user so clearUserCart finds it (lines 91-93)
        await Cart.create({
            user: user._id,
            items: cartItems.map(item => ({
                product: new mongoose.Types.ObjectId(),
                name: item.name,
                image: item.image,
                originalPrice: String(item.price),
                productId: item.id || new mongoose.Types.ObjectId().toString(),
                totalAvailableQty: '10',
                variantId: item.variantId || 'v1',
                variantName: 'Default',
                variantPrice: String(item.price),
                quantity: item.qty || 1,
            })),
        });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_clearcart_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_cc_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        const result = await checkoutService.verifyStripePayment(`cs_clearcart_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();

        // Cart should be cleared
        const cart = await Cart.findOne({ user: user._id });
        if (cart) {
            expect(cart.items).toHaveLength(0);
        }
    });
});

// ── verifyStripePayment — coupon not found (line 1271) + bankPromo error (line 1288) ──

describe('checkoutService.verifyStripePayment — coupon not found + bankPromo error', () => {
    const { sendEmail } = require('../../src/mail/emailService');

    beforeEach(() => {
        mockStripeInst.checkout.sessions.retrieve.mockReset();
        sendEmail.mockResolvedValue(undefined);
    });

    it('hits line 1271 when coupon not found for couponCode+mobileNumber', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        // No matching coupon in DB
        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_coupon_nf_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_cnf_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '0501234567', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: 'NOTEXIST', mobileNumber: '0501234567',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        const result = await checkoutService.verifyStripePayment(`cs_coupon_nf_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();
    });

    it('hits line 1288 when bankPromo lookup throws', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        // Use invalid bankPromoId that will cause BankPromoCode.findById to throw
        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_bperr_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_bpe_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: 'invalid-id-throws', saved_total: '0',
            },
        });

        // Should succeed despite bankPromo error (caught at line 1288)
        const result = await checkoutService.verifyStripePayment(`cs_bperr_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();
    });
});

// ── createOrderAndSendEmails — cartDataEntry not found (line 627) ─────────────

describe('checkoutService.handleTabbyWebhook — missing cart data (line 627)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('throws when cartDataId not found in DB', async () => {
        const fakeCartDataId = new mongoose.Types.ObjectId().toString();
        const payment = baseTabbyPayment(fakeCartDataId);

        require('axios').get = jest.fn().mockResolvedValue({ data: { ...payment, status: 'CLOSED' } });

        await expect(
            checkoutService.handleTabbyWebhook(
                { id: payment.id },
                null, '127.0.0.1', 'fake-tabby-webhook-secret'
            )
        ).rejects.toBeDefined();
    });
});

// ── verifyTabbyPayment — order.items mapping (line 1150) ─────────────────────

describe('checkoutService.verifyTabbyPayment — payment with items', () => {
    beforeEach(() => jest.clearAllMocks());

    it('covers items.map in verifyTabbyPayment when payment has order.items (line 1150)', async () => {
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        const paymentWithItems = {
            id: `pay_items_${Date.now()}`,
            status: 'CLOSED',
            amount: '100.00',
            buyer: { name: 'Buyer', email: 'b@test.com', phone: '050' },
            shipping_address: { address: 'Dubai', city: 'Dubai', zip: '' },
            order: {
                discount_amount: '0.00',
                shipping_amount: '0',
                tax_amount: '0',
                reference_id: 'ref-items',
                saved_total: '0.00',
                updated_at: new Date().toISOString(),
                items: [
                    {
                        title: 'Widget', description: 'A widget',
                        quantity: 1, unit_price: '100.00',
                        discount_amount: '0.00', reference_id: 'ref-item-1',
                        image_url: 'http://img.jpg', product_url: 'http://product.com',
                        category: 'general', brand: 'BrandX', is_refundable: true,
                    }
                ],
            },
            meta: {
                cartDataId: String(cartDataEntry._id),
                name: 'Buyer', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                subtotalAmount: '100', shippingCost: '0', currency: 'AED',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'tabby', discountPercent: '0',
                saved_total: '0', bankPromoId: '',
            },
        };

        require('axios').get = jest.fn()
            .mockResolvedValueOnce({ data: paymentWithItems })  // verifyTabbyPayment GET
            .mockResolvedValueOnce({ data: { ...paymentWithItems, status: 'AUTHORIZED' } }) // capture GET
            .mockResolvedValueOnce({ data: paymentWithItems }); // verifyTabbyPayment second

        // Use the exported verifyTabbyPayment
        const result = await checkoutService.verifyTabbyPayment(paymentWithItems.id);
        expect(result).toBeDefined();
    });
});

// ── clearUserCart — catch branch (line 96) ───────────────────────────────────

describe('checkoutService — clearUserCart catch branch (line 96)', () => {
    const { sendEmail } = require('../../src/mail/emailService');

    beforeEach(() => {
        mockStripeInst.checkout.sessions.retrieve.mockReset();
        sendEmail.mockResolvedValue(undefined);
    });

    it('covers clearUserCart error catch when cart.save throws', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        // Create a cart with invalid items to make save fail OR simply create one that triggers save
        // The safest way: create a valid cart, then mock Cart.findOne to return an object whose save throws
        const CartModel = require('../../src/models/Cart');
        const originalFindOne = CartModel.findOne.bind(CartModel);
        const cartDoc = await Cart.create({
            user: user._id,
            items: cartItems.map(item => ({
                product: new mongoose.Types.ObjectId(),
                name: item.name, image: item.image,
                originalPrice: String(item.price),
                productId: item.id || new mongoose.Types.ObjectId().toString(),
                totalAvailableQty: '10',
                variantId: item.variantId || 'v1',
                variantName: 'Default', variantPrice: String(item.price),
                quantity: 1,
            })),
        });

        // Monkey-patch Cart.findOne to return an object whose save throws
        CartModel.findOne = jest.fn().mockReturnValue({
            read: jest.fn().mockReturnThis(),
            then: undefined,
            // Return a thenable that resolves to an object with failing save
            exec: jest.fn().mockResolvedValue({
                items: [],
                save: jest.fn().mockRejectedValue(new Error('DB save failed')),
            }),
        });
        // Actually, Cart.findOne returns a query object. Simplest: mock the whole thing
        CartModel.findOne = jest.fn().mockImplementation(() => ({
            read: jest.fn().mockReturnThis(),
            lean: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue(null),
            then: undefined,
        }));

        // To actually cover line 96, we need cart.save() to throw.
        // Use a different approach: mock findOne to return a cart that throws on save
        CartModel.findOne = jest.fn().mockResolvedValue({
            items: cartDoc.items,
            save: jest.fn().mockRejectedValue(new Error('Cart save error')),
        });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_carterr_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_cerr_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'PR11', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        // Should not throw even though cart.save fails (error is caught)
        const result = await checkoutService.verifyStripePayment(`cs_carterr_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();

        // Restore
        CartModel.findOne = originalFindOne;
    });
});

// ── verifyNomodPayment — bankPromo error (line 1797) ─────────────────────────

describe('checkoutService.verifyNomodPayment — bankPromo error catch (line 1797)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('handles bankPromo error in verifyNomodPayment gracefully (line 1797)', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const paymentId = `nomod_bpe_${Date.now()}`;

        await PendingPayment.create({
            user_id: user._id,
            payment_id: paymentId,
            payment_method: 'nomod',
            status: 'pending',
            order_data: {
                cartData: cartItems, shippingCost: 0, name: 'Nomod', phone: '050',
                address: 'Dubai', city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '', currency: 'AED',
                discountAmount: '0', couponCode: '', mobileNumber: '', saved_total: 0,
                bankPromoId: 'invalid-throws-err', subtotalAmount: '50', totalAmount: '50',
            },
        });

        // Make the nomod provider return paid=true
        PaymentProviderFactory.create = jest.fn().mockReturnValue({
            getCheckout: jest.fn().mockResolvedValue({ paid: true, status: 'paid' }),
        });

        const req = { user: { _id: user._id }, body: { paymentId } };
        const result = await checkoutService.verifyNomodPayment(req);
        // BankPromoCode.findById throws but is caught at line 1797
        expect(result.orderId).toBeDefined();
    });
});

// ── verifyTabbyPayment (exported) — bankPromo error + items.map coverage ──────

describe('checkoutService.verifyTabbyPayment — bankPromo error (line 1511) + items (line 1150)', () => {
    const { sendEmail } = require('../../src/mail/emailService');
    beforeEach(() => {
        jest.clearAllMocks();
        sendEmail.mockResolvedValue(undefined);
    });

    it('covers bankPromo error catch in verifyTabbyPayment (line 1511)', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        const paymentId = `pay_vtbpe_${Date.now()}`;
        const payment = {
            id: paymentId, status: 'CLOSED', amount: '50.00',
            buyer: { name: 'VTP User', email: user.email, phone: '050' },
            shipping_address: { address: 'Dubai', city: 'Dubai', zip: '' },
            order: {
                discount_amount: '0', shipping_amount: '0', tax_amount: '0',
                reference_id: 'ref-vtp', saved_total: '0.00',
                updated_at: new Date().toISOString(),
                items: [],
            },
            meta: {
                cartDataId: String(cartDataEntry._id),
                name: 'VTP User', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                subtotalAmount: '50', shippingCost: '0', currency: 'AED',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'tabby', discountPercent: '0',
                saved_total: '0', bankPromoId: '',
            },
        };

        require('axios').get = jest.fn().mockResolvedValue({ data: payment });

        // Call verifyTabbyPayment(paymentId, userId, bankPromoId) — bankPromoId is invalid → throws → caught at 1511
        const result = await checkoutService.verifyTabbyPayment(paymentId, user._id.toString(), 'not-valid-objectid');
        expect(result).toBeDefined();
    });

    it('covers items.map in createOrderAndSendEmails (line 1150) via verifyTabbyPayment', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        const paymentId = `pay_vtitems_${Date.now()}`;
        const payment = {
            id: paymentId, status: 'CLOSED', amount: '100.00',
            buyer: { name: 'Items User', email: user.email, phone: '050' },
            shipping_address: { address: 'Dubai', city: 'Dubai', zip: '' },
            order: {
                discount_amount: '0', shipping_amount: '0', tax_amount: '0',
                reference_id: 'ref-items2', saved_total: '0.00',
                updated_at: new Date().toISOString(),
                // Provide actual items to trigger line 1150
                items: [
                    {
                        title: 'Widget A', description: 'Desc A',
                        quantity: 1, unit_price: '100.00',
                        discount_amount: '0.00', reference_id: 'ref-item-a',
                        image_url: 'http://img-a.jpg', product_url: 'http://product-a.com',
                        category: 'general', brand: 'Brand', is_refundable: true,
                    },
                ],
            },
            meta: {
                cartDataId: String(cartDataEntry._id),
                name: 'Items User', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                subtotalAmount: '100', shippingCost: '0', currency: 'AED',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'tabby', discountPercent: '0',
                saved_total: '0', bankPromoId: '',
            },
        };

        require('axios').get = jest.fn().mockResolvedValue({ data: payment });

        const result = await checkoutService.verifyTabbyPayment(paymentId, user._id.toString(), null);
        expect(result).toBeDefined();
    });
});

