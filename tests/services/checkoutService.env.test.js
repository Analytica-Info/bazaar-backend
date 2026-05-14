/**
 * checkoutService.env.test.js
 * PR11 — Cover ENVIRONMENT=true gated blocks in checkoutService.
 *
 * This file MUST set ENVIRONMENT=true before requiring setup/service
 * so that the module-level const ENVIRONMENT captures "true".
 *
 * Covers lines: 757-760, 770 (updateQuantities in createOrderAndSendEmails)
 *               1368-1384 (updateQuantities in verifyStripePayment)
 *               and the updateQuantities function body (128-600 range)
 */

// Set ENVIRONMENT=true FIRST before any module imports
process.env.ENVIRONMENT = 'true';
process.env.JWT_SECRET = 'test-jwt-secret-env';
process.env.STRIPE_SK = 'sk_test_fake_env';
process.env.API_KEY = 'fake-ls-key-env';
process.env.TABBY_AUTH_KEY = 'fake-tabby-auth-env';
process.env.TABBY_SECRET_KEY = 'fake-tabby-secret-env';
process.env.TABBY_WEBHOOK_SECRET = 'fake-tabby-webhook-secret';
process.env.TABBY_IPS = '127.0.0.1,10.0.0.1';
process.env.URL = 'http://localhost:3000';
process.env.FRONTEND_BASE_URL = 'http://localhost:3000';

// Connect mongoose BEFORE requiring the service
require('../setup');

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockStripeInst = {
    checkout: {
        sessions: {
            create: jest.fn().mockResolvedValue({ id: 'cs_env_test' }),
            retrieve: jest.fn(),
        },
    },
    paymentIntents: { create: jest.fn().mockResolvedValue({ id: 'pi_env', client_secret: 'sec_env' }) },
    coupons: { create: jest.fn().mockResolvedValue({ id: 'coupon_env', percent_off: 10, duration: 'once' }) },
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
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const CartData = require('../../src/models/CartData');

// Service imported AFTER process.env.ENVIRONMENT = 'true' is set
const checkoutService = require('../../src/services/checkoutService');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeUser() {
    return User.create({
        name: 'Env User',
        email: `env-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
        phone: `05${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
        password: 'hash',
    });
}

function buildCartItems(n = 1) {
    return Array.from({ length: n }, (_, i) => ({
        id: new mongoose.Types.ObjectId().toString(),
        product_id: new mongoose.Types.ObjectId().toString(),
        name: `Env Widget ${i}`,
        price: 50 + i * 10,
        qty: 1,
        total_qty: 10,
        variantId: `ls-env-var-${i}`,
        variant: 'Default',
        image: `http://img/env-${i}.jpg`,
    }));
}

function baseTabbyPayment(cartDataId, overrides = {}) {
    return {
        id: `pay_env_${Date.now()}`,
        status: 'CLOSED',
        amount: '100.00',
        buyer: { name: 'Env Buyer', email: `env-buyer-${Date.now()}@test.com`, phone: '0501234567' },
        shipping_address: { address: 'Dubai', city: 'Dubai', zip: '' },
        order: {
            discount_amount: '0.00', shipping_amount: '0', tax_amount: '0',
            reference_id: 'ref-env', saved_total: '0.00',
            updated_at: new Date().toISOString(), items: [],
        },
        meta: {
            cartDataId: String(cartDataId),
            name: 'Env Buyer', phone: '0501234567', address: 'Dubai Marina',
            city: 'Dubai', area: 'Marina', buildingName: 'Tower', floorNo: '1',
            apartmentNo: '101', landmark: '',
            subtotalAmount: '100', shippingCost: '0', currency: 'AED',
            couponCode: '', mobileNumber: '',
            paymentMethod: 'tabby', discountPercent: '0',
            saved_total: '0', bankPromoId: '',
        },
        ...overrides,
    };
}

// ── ENVIRONMENT=true block in createOrderAndSendEmails (lines 757-760, 770) ──

describe('checkoutService ENVIRONMENT=true — handleTabbyWebhook updateQuantities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        require('../../src/mail/emailService').sendEmail.mockResolvedValue(undefined);
    });

    it('covers ENVIRONMENT=true updateQuantities in createOrderAndSendEmails (lines 757-760)', async () => {
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });
        const payment = baseTabbyPayment(cartDataEntry._id);

        // Mock axios: first call returns Tabby payment, subsequent calls return inventory
        axios.get = jest.fn().mockImplementation((url) => {
            if (url.includes('tabby.ai')) {
                return Promise.resolve({ data: payment });
            }
            // Lightspeed inventory calls inside updateQuantities/getDiagnosticInventory
            return Promise.resolve({ data: { data: [{ inventory_level: 10 }] } });
        });
        axios.put = jest.fn().mockResolvedValue({ data: { data: { inventory_level: 9 } } });

        const result = await checkoutService.handleTabbyWebhook(
            { id: payment.id },
            null, '127.0.0.1', 'fake-tabby-webhook-secret'
        );
        expect(result).toBeDefined();
    });

    it('covers ENVIRONMENT=true updateQuantities error catch (line 770)', async () => {
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });
        const payment = baseTabbyPayment(cartDataEntry._id);

        axios.get = jest.fn().mockImplementation((url) => {
            if (url.includes('tabby.ai')) {
                return Promise.resolve({ data: payment });
            }
            // All Lightspeed calls throw
            return Promise.reject(new Error('Lightspeed down'));
        });

        const result = await checkoutService.handleTabbyWebhook(
            { id: payment.id },
            null, '127.0.0.1', 'fake-tabby-webhook-secret'
        );
        expect(result).toBeDefined();
    });
});

// ── ENVIRONMENT=true block in verifyStripePayment (lines 1368-1384) ───────────

describe('checkoutService ENVIRONMENT=true — verifyStripePayment updateQuantities', () => {
    beforeEach(() => {
        mockStripeInst.checkout.sessions.retrieve.mockReset();
        require('../../src/mail/emailService').sendEmail.mockResolvedValue(undefined);
        jest.clearAllMocks();
    });

    it('covers ENVIRONMENT=true updateQuantities in verifyStripePayment (lines 1368-1371)', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_env_uspv_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_env_uspv_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'Env User', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        axios.get = jest.fn().mockImplementation((url) => {
            // Lightspeed inventory calls
            return Promise.resolve({ data: { data: [{ inventory_level: 10 }] } });
        });
        axios.put = jest.fn().mockResolvedValue({ data: { data: { inventory_level: 9 } } });

        const result = await checkoutService.verifyStripePayment(`cs_env_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();
    });

    it('covers ENVIRONMENT=true updateQuantities error catch in verifyStripePayment (lines 1378-1384)', async () => {
        const user = await makeUser();
        const cartItems = buildCartItems(1);
        const cartDataEntry = await CartData.create({ cartData: cartItems });

        mockStripeInst.checkout.sessions.retrieve.mockResolvedValueOnce({
            id: `cs_env_err_${Date.now()}`,
            payment_status: 'paid',
            payment_intent: `pi_env_err_${Date.now()}`,
            customer_details: { email: user.email },
            metadata: {
                cartDataId: cartDataEntry._id.toString(),
                name: 'Env User', phone: '050', address: 'Dubai',
                city: 'Dubai', area: '', buildingName: '', floorNo: '',
                apartmentNo: '', landmark: '',
                shippingCost: '0', currency: 'aed',
                totalAmount: '100.00', subTotalAmount: '100.00',
                couponCode: '', mobileNumber: '',
                paymentMethod: 'card', discountAmount: '0',
                bankPromoId: '', saved_total: '0',
            },
        });

        // Make Lightspeed calls fail → triggers catch block at 1378
        axios.get = jest.fn().mockRejectedValue(new Error('Lightspeed down'));

        const result = await checkoutService.verifyStripePayment(`cs_env_err_${Date.now()}`, user._id.toString());
        expect(result.orderId).toBeDefined();
    });
});
