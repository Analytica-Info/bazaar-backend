/**
 * orderService.coverage.test.js
 * PR7 — Push orderService to ≥80% lines.
 * Focuses on paths not covered by the base orderService.test.js.
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

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('stripe', () => {
  const inst = {
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_order_cov_123' }),
        retrieve: jest.fn(),
      },
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_order_cov_123', client_secret: 'secret_cov' }),
    },
    coupons: {
      create: jest.fn().mockResolvedValue({ id: 'coupon_cov', percent_off: 10, duration: 'once' }),
    },
  };
  const ctor = jest.fn(() => inst);
  ctor._instance = inst;
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

const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const OrderDetail = require('../../src/models/OrderDetail');
const Product = require('../../src/models/Product');
const CartData = require('../../src/models/CartData');
const PendingPayment = require('../../src/models/PendingPayment');
const Notification = require('../../src/models/Notification');

const orderService = require('../../src/services/orderService');
const stripeInst = require('stripe')._instance;

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function makeUser(overrides = {}) {
  return User.create({
    name: 'Test User',
    email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    phone: '0501234567',
    password: 'hash',
    ...overrides,
  });
}

async function makeProduct(overrides = {}) {
  const id = `prod-cov-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return Product.create({
    product: { id, name: 'Coverage Widget', sku_number: `SKU-${id}`, ...overrides.product },
    variantsData: overrides.variantsData || [{ id: `var-${id}`, qty: 10, name: 'Default' }],
    totalQty: overrides.totalQty ?? 10,
    status: overrides.status ?? true,
    ...overrides,
  });
}

async function makeOrder(userId, overrides = {}) {
  const no = overrides.order_no || Math.floor(Math.random() * 90000) + 10000;
  return Order.create({
    userId,
    order_id: `BZR-COV-${no}`,
    order_no: no,
    name: 'Test User',
    address: 'Dubai',
    email: 'user@test.com',
    status: 'Confirmed',
    amount_subtotal: '100.00',
    amount_total: '130.00',
    discount_amount: '0.00',
    shipping: '30.00',
    txn_id: `txn_cov_${Date.now()}`,
    payment_method: 'card',
    payment_status: 'paid',
    orderfrom: 'Website',
    ...overrides,
  });
}

function buildCartItems(n = 1) {
  return Array.from({ length: n }, (_, i) => ({
    id: `ls-cov-${i}-${Date.now()}`,
    product_id: new mongoose.Types.ObjectId().toString(),
    name: `Widget ${i}`,
    price: 50 + i * 10,
    qty: 1,
    variant: 'Default',
    image: `http://img/${i}.jpg`,
  }));
}

const lsInventoryResponse = (qty) => ({
  data: { data: [{ inventory_level: qty }] },
});

// ── updateOrderStatus — extended ─────────────────────────────────────────────

describe('orderService — updateOrderStatus (extended)', () => {
  it('throws 404 when order not found', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(orderService.updateOrderStatus(fakeId, 'Packed', null))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when requestingUserId does not own order', async () => {
    const owner = await makeUser();
    const order = await makeOrder(owner._id);
    const other = await makeUser();

    await expect(
      orderService.updateOrderStatus(order._id.toString(), 'Packed', null, other._id.toString())
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows update when requestingUserId owns order', async () => {
    const owner = await makeUser();
    const order = await makeOrder(owner._id);

    const result = await orderService.updateOrderStatus(
      order._id.toString(), 'Packed', null, owner._id.toString()
    );
    expect(result.status).toBe('Packed');
  });

  describe.each([
    ['Packed'],
    ['On The Way'],
    ['Arrived At Facility'],
    ['Out For Delivery'],
    ['Delivered'],
    ['Confirmed'],
  ])('allows status transition: %s', (status) => {
    it(`sets order status to "${status}"`, async () => {
      const user = await makeUser();
      const order = await makeOrder(user._id);

      const result = await orderService.updateOrderStatus(order._id.toString(), status, null);
      expect(result.status).toBe(status);
    });
  });

  it('adds imagePath to orderTrack when filePath is provided (clock seam)', async () => {
    const clock = require('../../src/utilities/clock');
    const frozen = new Date('2026-03-15T10:00:00.000Z');
    clock.setClock({ now: () => frozen, nowMs: () => frozen.getTime() });

    const user = await makeUser();
    const order = await makeOrder(user._id);

    const result = await orderService.updateOrderStatus(
      order._id.toString(), 'Delivered', 'uploads/proof/img.jpg'
    );

    clock.resetClock();

    expect(new Date(result.orderTracks[0].dateTime).toISOString()).toBe(frozen.toISOString());
    expect(result.orderTracks[0].image).toContain('img.jpg');
  });
});

// ── uploadProofOfDelivery — extended ─────────────────────────────────────────

describe('orderService — uploadProofOfDelivery (extended)', () => {
  it('saves proof from valid image files', async () => {
    const user = await makeUser();
    const order = await makeOrder(user._id, { order_id: 'BZR-PROOF01', order_no: 60001 });

    const files = [
      { originalname: 'proof.jpg', mimetype: 'image/jpeg', filename: 'proof-123.jpg' },
    ];

    const result = await orderService.uploadProofOfDelivery('BZR-PROOF01', files, null);
    expect(result.message).toMatch(/proof of delivery/i);
    expect(result.proof_of_delivery).toHaveLength(1);
    expect(result.proof_of_delivery[0]).toContain('proof-123.jpg');
  });

  it('throws 400 for invalid file type (e.g., .exe)', async () => {
    const user = await makeUser();
    await makeOrder(user._id, { order_id: 'BZR-PROOF02', order_no: 60002 });

    const files = [
      { originalname: 'malware.exe', mimetype: 'application/octet-stream', filename: 'bad.exe' },
    ];

    await expect(orderService.uploadProofOfDelivery('BZR-PROOF02', files, null))
      .rejects.toMatchObject({ status: 400 });
  });

  it('saves proof from JSON string bodyProof', async () => {
    const user = await makeUser();
    await makeOrder(user._id, { order_id: 'BZR-PROOF03', order_no: 60003 });

    const result = await orderService.uploadProofOfDelivery(
      'BZR-PROOF03', null, JSON.stringify(['http://example.com/p1.jpg'])
    );
    expect(result.proof_of_delivery).toHaveLength(1);
  });

  it('saves proof from single string bodyProof (not JSON)', async () => {
    const user = await makeUser();
    await makeOrder(user._id, { order_id: 'BZR-PROOF04', order_no: 60004 });

    const result = await orderService.uploadProofOfDelivery(
      'BZR-PROOF04', null, 'http://example.com/single.jpg'
    );
    expect(result.proof_of_delivery).toHaveLength(1);
  });

  it('shows "updated" message when replacing previous proof', async () => {
    const user = await makeUser();
    const order = await makeOrder(user._id, { order_id: 'BZR-PROOF05', order_no: 60005 });

    // First save
    await orderService.uploadProofOfDelivery(
      'BZR-PROOF05', null, ['http://example.com/old.jpg']
    );

    // Second save (update)
    const result = await orderService.uploadProofOfDelivery(
      'BZR-PROOF05', null, ['http://example.com/new.jpg']
    );

    expect(result.message).toMatch(/updated/i);
  });
});

// ── validateInventoryBeforeCheckout — additional branches ──────────────────

describe('orderService — validateInventoryBeforeCheckout (additional)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns isValid=true for item with gift (isGift=true) product — bypasses LS check', async () => {
    const product = await makeProduct({
      product: { name: 'Gift Product', id: 'gift-p1', sku_number: 'SKU-GIFT' },
      variantsData: [{ id: 'var-gift-p1', qty: 10, name: 'Default' }],
      totalQty: 10,
      isGift: true,
    });

    axios.get.mockResolvedValue(lsInventoryResponse(10));

    const result = await orderService.validateInventoryBeforeCheckout(
      [{ product_id: product._id.toString(), qty: 1 }],
      {},
      'test'
    );

    expect(result.isValid).toBe(true);
  });

  describe.each([
    ['in-stock', 15, 10, 3, true, null],
    ['low-stock-passes', 3, 10, 2, true, null],
    ['OOS-lightspeed', 0, 10, 5, false, 'lightspeed'],
    ['OOS-local', 20, 1, 5, false, 'local'],
    ['partial-OOS-both', 1, 1, 5, false, 'both'],
  ])('inventory validation matrix: %s', (_label, lsQty, localQty, orderedQty, expectValid, expectDbIndex) => {
    it(`validates correctly (lsQty=${lsQty}, localQty=${localQty}, ordered=${orderedQty})`, async () => {
      const product = await makeProduct({
        product: { name: `Matrix ${_label}`, id: `matrix-${_label}`, sku_number: `SKU-M-${_label}` },
        variantsData: [{ id: `var-m-${_label}`, qty: localQty, name: 'Default' }],
        totalQty: localQty,
      });

      axios.get.mockResolvedValueOnce(lsInventoryResponse(lsQty));

      if (expectValid) {
        const result = await orderService.validateInventoryBeforeCheckout(
          [{ product_id: product._id.toString(), qty: orderedQty }],
          {}, 'test'
        );
        expect(result.isValid).toBe(true);
      } else {
        const err = await orderService.validateInventoryBeforeCheckout(
          [{ product_id: product._id.toString(), qty: orderedQty }],
          {}, 'test'
        ).catch(e => e);

        expect(err.status).toBe(400);
        if (expectDbIndex) {
          expect(err.data.results[0].dbIndex).toBe(expectDbIndex);
        }
      }
    });
  });
});

// ── createTabbyCheckoutSession ─────────────────────────────────────────────

describe('orderService — createTabbyCheckoutSession', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
  });

  it('throws 400 when payment_method is not tabby', async () => {
    const user = await makeUser();
    await expect(
      orderService.createTabbyCheckoutSession(user._id.toString(), {
        cartData: [],
        payment_method: 'stripe',
        paymentIntentId: 'pi_xyz',
      }, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when paymentIntentId is missing', async () => {
    const user = await makeUser();
    await expect(
      orderService.createTabbyCheckoutSession(user._id.toString(), {
        cartData: [],
        payment_method: 'tabby',
        paymentIntentId: null,
      }, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('creates PendingPayment when payment_method is tabby with valid paymentIntentId', async () => {
    const user = await makeUser();
    const cartItems = buildCartItems(1);

    axios.get.mockResolvedValue({ data: { status: 'CLOSED', amount: '100' } });
    axios.post.mockResolvedValue({ data: { status: 'CLOSED' } });

    await orderService.createTabbyCheckoutSession(user._id.toString(), {
      cartData: cartItems,
      payment_method: 'tabby',
      paymentIntentId: `pi_tabby_${Date.now()}`,
      name: 'Test',
      phone: '050',
      address: 'Dubai',
      city: 'Dubai',
      area: 'Marina',
      buildingName: '',
      floorNo: '',
      apartmentNo: '',
      landmark: 'Near Mall',
      state: '',
      currency: 'AED',
      discountPercent: 0,
      discountAmount: 0,
      couponCode: '',
      mobileNumber: '',
      user_email: 'test@test.com',
      total: 100,
      sub_total: 100,
      shippingCost: 0,
      txnId: null,
      paymentStatus: 'paid',
    }, {});

    const pending = await PendingPayment.findOne({ payment_method: 'tabby' });
    expect(pending).not.toBeNull();
  });
});

// ── createStripeCheckoutSession ───────────────────────────────────────────

describe('orderService — createStripeCheckoutSession', () => {
  it('throws 400 when paymentIntentId is missing for stripe payment_method', async () => {
    const user = await makeUser();
    await expect(
      orderService.createStripeCheckoutSession(user._id.toString(), {
        cartData: buildCartItems(1),
        payment_method: 'stripe',
        paymentIntentId: null,
        user_email: 'u@test.com',
        total: 100,
        sub_total: 100,
        shippingCost: 0,
        name: 'T',
        phone: '050',
        address: 'Dubai',
        state: '',
        city: '',
        area: '',
        floorNo: '',
        buildingName: '',
        apartmentNo: '',
        landmark: 'Near Mall',
        currency: 'AED',
        discountPercent: 0,
        discountAmount: 0,
        couponCode: '',
        mobileNumber: '',
        txnId: null,
        paymentStatus: null,
      }, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('creates PendingPayment for stripe payment', async () => {
    const user = await makeUser();
    const paymentIntentId = `pi_stripe_cov_${Date.now()}`;

    stripeInst.paymentIntents.create.mockResolvedValueOnce({
      id: paymentIntentId,
      client_secret: 'secret',
    });

    await orderService.createStripeCheckoutSession(user._id.toString(), {
      cartData: buildCartItems(1),
      payment_method: 'stripe',
      paymentIntentId,
      user_email: 'stripe@test.com',
      total: 100,
      sub_total: 100,
      shippingCost: 0,
      name: 'Stripe User',
      phone: '050',
      address: 'Dubai',
      state: '',
      city: 'Dubai',
      area: 'Marina',
      floorNo: '',
      buildingName: '',
      apartmentNo: '',
      landmark: 'Near Mall',
      currency: 'AED',
      discountPercent: 0,
      discountAmount: 0,
      couponCode: '',
      mobileNumber: '',
      txnId: paymentIntentId,
      paymentStatus: 'succeeded',
    }, {});

    const pending = await PendingPayment.findOne({ payment_id: paymentIntentId });
    expect(pending).not.toBeNull();
    expect(pending.payment_method).toBe('stripe');
  });
});

// ── verifyTabbyPayment (orderService) ────────────────────────────────────

describe('orderService — verifyTabbyPayment', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
  });

  it('throws 400 when paymentId is missing', async () => {
    await expect(orderService.verifyTabbyPayment(null)).rejects.toMatchObject({ status: 400 });
  });

  it('returns message for CLOSED status', async () => {
    const paymentId = `pay_vtbos_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'CLOSED', amount: '100.00' } });

    const result = await orderService.verifyTabbyPayment(paymentId);
    expect(result.message).toContain('CLOSED');
  });

  it('returns message when AUTHORIZED and capture succeeds', async () => {
    const paymentId = `pay_vtbos_auth_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'AUTHORIZED', amount: '100.00' } });
    axios.post.mockResolvedValueOnce({ data: { status: 'CLOSED' } });

    const result = await orderService.verifyTabbyPayment(paymentId);
    expect(result.message).toBeDefined();
  });

  it('throws 500 when AUTHORIZED but capture fails', async () => {
    const paymentId = `pay_vtbos_fail_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'AUTHORIZED', amount: '100.00' } });
    axios.post.mockResolvedValueOnce({ data: { status: 'PENDING' } });

    await expect(orderService.verifyTabbyPayment(paymentId)).rejects.toMatchObject({ status: 500 });
  });

  it('returns finalStatus for non-CLOSED status', async () => {
    const paymentId = `pay_vtbos_rej_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'REJECTED', amount: '100.00' } });

    const result = await orderService.verifyTabbyPayment(paymentId);
    expect(result.finalStatus).toBe('REJECTED');
  });

  it('throws 403 when requesting user does not own payment', async () => {
    const paymentId = `pay_vtbos_403_${Date.now()}`;
    const owner = await makeUser();
    const other = await makeUser();

    await PendingPayment.create({
      user_id: owner._id,
      payment_id: paymentId,
      payment_method: 'tabby',
      order_data: {},
      status: 'pending',
      orderfrom: 'Mobile App',
      orderTime: 'now',
    });

    await expect(
      orderService.verifyTabbyPayment(paymentId, other._id.toString())
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ── handleTabbyWebhook (orderService) ────────────────────────────────────

describe('orderService — handleTabbyWebhook', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
  });

  it('throws 403 when IP not allowed', async () => {
    await expect(orderService.handleTabbyWebhook({
      clientIP: '9.9.9.9',
      secret: 'fake-tabby-webhook-secret',
      data: { id: 'pay_123' },
    })).rejects.toMatchObject({ status: 403 });
  });

  it('throws 401 when secret is wrong', async () => {
    await expect(orderService.handleTabbyWebhook({
      clientIP: '127.0.0.1',
      secret: 'wrong-secret',
      data: { id: 'pay_123' },
    })).rejects.toMatchObject({ status: 401 });
  });

  it('throws 400 when paymentId missing from data', async () => {
    await expect(orderService.handleTabbyWebhook({
      clientIP: '127.0.0.1',
      secret: 'fake-tabby-webhook-secret',
      data: {},
    })).rejects.toMatchObject({ status: 400 });
  });

  it('returns "Webhook received" for REJECTED status', async () => {
    const paymentId = `pay_wh_os_rej_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'REJECTED', amount: '100', id: paymentId } });

    const result = await orderService.handleTabbyWebhook({
      clientIP: '127.0.0.1',
      secret: 'fake-tabby-webhook-secret',
      data: { id: paymentId },
    });
    expect(result.message).toBe('Webhook received');
  });

  it('returns "Order processed" for CLOSED status with no PendingPayment', async () => {
    const paymentId = `pay_wh_os_closed_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'CLOSED', amount: '100', id: paymentId } });

    const result = await orderService.handleTabbyWebhook({
      clientIP: '127.0.0.1',
      secret: 'fake-tabby-webhook-secret',
      data: { id: paymentId },
    });
    expect(result.message).toBe('Order processed');
  });

  it('returns "Order processed" for CREATED status', async () => {
    const paymentId = `pay_wh_os_created_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'CREATED', amount: '100', id: paymentId } });

    const result = await orderService.handleTabbyWebhook({
      clientIP: '127.0.0.1',
      secret: 'fake-tabby-webhook-secret',
      data: { id: paymentId },
    });
    expect(result.message).toBe('Order processed');
  });

  it('throws 500 when AUTHORIZED but capture fails', async () => {
    const paymentId = `pay_wh_os_capfail_${Date.now()}`;
    axios.get.mockResolvedValueOnce({ data: { status: 'AUTHORIZED', amount: '100', id: paymentId } });
    axios.post.mockResolvedValueOnce({ data: { status: 'PENDING' } });

    await expect(orderService.handleTabbyWebhook({
      clientIP: '127.0.0.1',
      secret: 'fake-tabby-webhook-secret',
      data: { id: paymentId },
    })).rejects.toMatchObject({ status: 500 });
  });

  it('processes CLOSED status with pending payment and creates order', async () => {
    const paymentId = `pay_wh_os_pp_${Date.now()}`;
    const cartItems = buildCartItems(1);
    const cartDataEntry = await CartData.create({ cartData: cartItems });
    const user = await makeUser();

    // Create a PendingPayment record
    await PendingPayment.create({
      user_id: user._id,
      payment_id: paymentId,
      payment_method: 'tabby',
      order_data: {
        cartData: cartItems,
        shippingCost: 0,
        name: 'Test User',
        phone: '050',
        address: 'Dubai',
        city: 'Dubai',
        area: 'Marina',
        buildingName: '',
        floorNo: '',
        apartmentNo: '',
        landmark: 'Near Mall',
        currency: 'AED',
        discountPercent: 0,
        discountAmount: 0,
        couponCode: '',
        mobileNumber: '',
        user_email: user.email,
        total: 100,
        sub_total: 100,
        txnId: paymentId,
        paymentStatus: 'paid',
        fcmToken: null,
      },
      status: 'pending',
      orderfrom: 'Mobile App',
      orderTime: '01 May 2026, 10:00 am',
    });

    axios.get.mockResolvedValueOnce({ data: { status: 'CLOSED', amount: '100', id: paymentId } });

    const result = await orderService.handleTabbyWebhook({
      clientIP: '127.0.0.1',
      secret: 'fake-tabby-webhook-secret',
      data: { id: paymentId },
    });

    expect(result.message).toBe('Order processed');

    // Order should be created
    const order = await Order.findOne({ txn_id: paymentId });
    expect(order).not.toBeNull();
  });
});

// ── createNomodCheckoutSession ────────────────────────────────────────────

describe('orderService — createNomodCheckoutSession', () => {
  it('throws 400 when payment_method is not nomod', async () => {
    const user = await makeUser();
    await expect(
      orderService.createNomodCheckoutSession(user._id.toString(), {
        cartData: buildCartItems(1),
        payment_method: 'stripe', // wrong method
        paymentIntentId: 'pi_xyz',
        name: 'Test',
        phone: '050',
        currency: 'AED',
        shippingCost: 0,
      }, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when paymentIntentId is missing for nomod', async () => {
    const user = await makeUser();
    await expect(
      orderService.createNomodCheckoutSession(user._id.toString(), {
        cartData: buildCartItems(1),
        payment_method: 'nomod',
        paymentIntentId: null,
        name: 'Test',
        phone: '050',
        currency: 'AED',
        shippingCost: 0,
      }, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it('creates PendingPayment for nomod payment', async () => {
    const user = await makeUser();
    const paymentIntentId = `chk_nomod_cov_${Date.now()}`;

    await orderService.createNomodCheckoutSession(user._id.toString(), {
      cartData: buildCartItems(1),
      payment_method: 'nomod',
      paymentIntentId,
      name: 'Nomod User',
      phone: '050',
      address: 'Dubai',
      state: '',
      city: 'Dubai',
      area: 'Marina',
      buildingName: '',
      floorNo: '',
      apartmentNo: '',
      landmark: 'Near Mall',
      currency: 'AED',
      shippingCost: 0,
      discountPercent: 0,
      discountAmount: 0,
      couponCode: '',
      mobileNumber: '',
      user_email: user.email,
      total: 100,
      sub_total: 100,
      txnId: paymentIntentId,
      paymentStatus: 'paid',
    }, {});

    const pending = await PendingPayment.findOne({ payment_id: paymentIntentId });
    expect(pending).not.toBeNull();
    expect(pending.payment_method).toBe('nomod');
  });
});

// ── verifyNomodPayment (orderService) ────────────────────────────────────

describe('orderService — verifyNomodPayment', () => {
  it('throws 400 when paymentId is missing', async () => {
    await expect(orderService.verifyNomodPayment(null)).rejects.toMatchObject({ status: 400 });
  });

  it('returns finalStatus when payment is not paid', async () => {
    const PaymentProviderFactory = require('../../src/services/payments/PaymentProviderFactory');
    const mockProvider = {
      getCheckout: jest.fn().mockResolvedValue({ paid: false, status: 'created', id: 'chk_unpaid' }),
    };
    jest.spyOn(PaymentProviderFactory, 'create').mockReturnValue(mockProvider);

    const result = await orderService.verifyNomodPayment('chk_unpaid');
    expect(result.finalStatus).toBe('created');

    PaymentProviderFactory.create.mockRestore();
  });

  it('returns message when payment is paid', async () => {
    const PaymentProviderFactory = require('../../src/services/payments/PaymentProviderFactory');
    const mockProvider = {
      getCheckout: jest.fn().mockResolvedValue({ paid: true, status: 'paid', id: 'chk_paid' }),
    };
    jest.spyOn(PaymentProviderFactory, 'create').mockReturnValue(mockProvider);

    const result = await orderService.verifyNomodPayment('chk_paid');
    expect(result.message).toContain('paid');

    PaymentProviderFactory.create.mockRestore();
  });
});

// ── initStripePayment ────────────────────────────────────────────────────

describe('orderService — initStripePayment', () => {
  beforeEach(() => {
    // Reset any leftover queued mock values from previous describe blocks
    stripeInst.paymentIntents.create.mockReset();
    stripeInst.paymentIntents.create.mockResolvedValue({ id: 'pi_order_cov_123', client_secret: 'secret_cov' });
    // Add customers and ephemeralKeys to stripeInst for initStripePayment
    stripeInst.customers = {
      create: jest.fn().mockResolvedValue({ id: 'cus_mock_123' }),
    };
    stripeInst.ephemeralKeys = {
      create: jest.fn().mockResolvedValue({ id: 'ek_mock', secret: 'ek_secret_mock' }),
    };
  });

  it('creates paymentIntent and returns clientSecret', async () => {
    const user = await makeUser();
    stripeInst.paymentIntents.create.mockResolvedValueOnce({
      id: 'pi_init_123',
      client_secret: 'secret_init_abc',
    });

    const result = await orderService.initStripePayment(user._id.toString(), 100);
    expect(result.clientSecret).toBe('secret_init_abc');
    expect(result.paymentIntentId).toBe('pi_init_123');
  });

  it('passes correct amount in fils to Stripe', async () => {
    const user = await makeUser();
    stripeInst.paymentIntents.create.mockClear();
    stripeInst.paymentIntents.create.mockResolvedValueOnce({
      id: 'pi_amount_test',
      client_secret: 'secret_amount',
    });

    await orderService.initStripePayment(user._id.toString(), 250);

    const call = stripeInst.paymentIntents.create.mock.calls[0][0];
    // 250 AED * 100 = 25000 fils
    expect(call.amount).toBe(25000);
  });

  it('throws 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(orderService.initStripePayment(fakeId, 100)).rejects.toMatchObject({ status: 404 });
  });
});

// ── validateInventoryBeforeCheckout — timeout and error ──────────────────

describe('orderService — validateInventoryBeforeCheckout (lightspeed error paths)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('handles lightspeed timeout gracefully and reports lightspeedApiError', async () => {
    const product = await makeProduct({
      product: { name: 'Timeout Prod', id: 'tout-1', sku_number: 'SKU-TO' },
      variantsData: [{ id: 'var-tout-1', qty: 10, name: 'Default' }],
      totalQty: 10,
    });

    const timeoutErr = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    axios.get.mockRejectedValueOnce(timeoutErr);

    const err = await orderService.validateInventoryBeforeCheckout(
      [{ product_id: product._id.toString(), qty: 1 }],
      {}, 'test'
    ).catch(e => e);

    expect(err.status).toBe(400);
    expect(err.data.results[0].lightspeedApiError).toBeDefined();
  });

  it('handles 5xx Lightspeed error gracefully', async () => {
    const product = await makeProduct({
      product: { name: '5xx Prod', id: '5xx-prod-1', sku_number: 'SKU-5XX' },
      variantsData: [{ id: 'var-5xx-1', qty: 10, name: 'Default' }],
      totalQty: 10,
    });

    axios.get.mockRejectedValueOnce({ response: { status: 503 }, message: 'Service Unavailable' });

    const err = await orderService.validateInventoryBeforeCheckout(
      [{ product_id: product._id.toString(), qty: 1 }],
      {}, 'test'
    ).catch(e => e);

    expect(err.status).toBe(400);
    expect(err.data.results[0].lightspeedApiError).toBeDefined();
  });
});

// ── getAddresses ─────────────────────────────────────────────────────────────

describe('orderService — getAddresses', () => {
  it('throws 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(orderService.getAddresses(fakeId)).rejects.toMatchObject({ status: 404 });
  });

  it('returns flag=false and empty array for user with no addresses', async () => {
    const user = await makeUser();
    const result = await orderService.getAddresses(user._id.toString());
    expect(result.flag).toBe(false);
    expect(result.address).toHaveLength(0);
  });

  it('returns flag=true and addresses for user with addresses', async () => {
    const user = await User.create({
      name: 'Addr User',
      email: `addr-${Date.now()}@test.com`,
      phone: '0501234567',
      password: 'hash',
      address: [{ name: 'Home', city: 'Dubai', area: 'Marina', floorNo: '1', apartmentNo: '101', landmark: 'Near Mall', buildingName: 'Tower', mobile: '050', state: 'Dubai', country: 'AE', isPrimary: true }],
    });
    const result = await orderService.getAddresses(user._id.toString());
    expect(result.flag).toBe(true);
    expect(result.address.length).toBeGreaterThan(0);
  });
});

// ── storeAddress ─────────────────────────────────────────────────────────────

describe('orderService — storeAddress', () => {
  it('throws 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      orderService.storeAddress(fakeId, { name: 'Home', city: 'Dubai', area: 'Marina' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('adds a new address when no _id provided', async () => {
    const user = await makeUser();
    const result = await orderService.storeAddress(user._id.toString(), {
      name: 'Home', city: 'Dubai', area: 'Marina', floorNo: '2',
      apartmentNo: '201', landmark: 'Near Mall', buildingName: 'Tower B',
      mobile: '0501234567', state: 'Dubai', country: 'AE',
    });
    expect(result.message).toContain('added');
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0].city).toBe('Dubai');
  });

  it('updates existing address when _id provided', async () => {
    const user = await User.create({
      name: 'Upd User', email: `upd-${Date.now()}@test.com`, phone: '050', password: 'hash',
      address: [{ name: 'Old', city: 'Abu Dhabi', area: 'Corniche', floorNo: '1', apartmentNo: '1', landmark: 'Near Mall', buildingName: 'Bldg', mobile: '050', state: 'AD', country: 'AE', isPrimary: true }],
    });
    const addrId = user.address[0]._id.toString();
    const result = await orderService.storeAddress(user._id.toString(), {
      _id: addrId, name: 'Home', city: 'Dubai', area: 'Marina', floorNo: '3',
      apartmentNo: '301', landmark: 'Near Mall', buildingName: 'Tower A', mobile: '050', state: 'Dubai', country: 'AE',
    });
    expect(result.message).toContain('updated');
    expect(result.addresses[0].city).toBe('Dubai');
  });

  it('throws 404 when updating address with bad _id', async () => {
    const user = await makeUser();
    const fakeAddrId = new mongoose.Types.ObjectId().toString();
    await expect(
      orderService.storeAddress(user._id.toString(), { _id: fakeAddrId, name: 'X', city: 'X' })
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── deleteAddress ─────────────────────────────────────────────────────────────

describe('orderService — deleteAddress', () => {
  it('throws 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      orderService.deleteAddress(fakeId, new mongoose.Types.ObjectId().toString())
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when address not found', async () => {
    const user = await makeUser();
    const fakeAddrId = new mongoose.Types.ObjectId().toString();
    await expect(
      orderService.deleteAddress(user._id.toString(), fakeAddrId)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('deletes address successfully', async () => {
    const user = await User.create({
      name: 'Del User', email: `del-${Date.now()}@test.com`, phone: '050', password: 'hash',
      address: [{ name: 'Home', city: 'Dubai', area: 'Marina', floorNo: '1', apartmentNo: '101', landmark: 'Near Mall', buildingName: 'T', mobile: '050', state: 'Dubai', country: 'AE', isPrimary: true }],
    });
    const addrId = user.address[0]._id.toString();
    const result = await orderService.deleteAddress(user._id.toString(), addrId);
    expect(result.addresses).toHaveLength(0);
  });
});

// ── setPrimaryAddress ─────────────────────────────────────────────────────────

describe('orderService — setPrimaryAddress', () => {
  it('throws 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      orderService.setPrimaryAddress(fakeId, new mongoose.Types.ObjectId().toString())
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when address not found', async () => {
    const user = await makeUser();
    const fakeAddrId = new mongoose.Types.ObjectId().toString();
    await expect(
      orderService.setPrimaryAddress(user._id.toString(), fakeAddrId)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('sets primary address successfully', async () => {
    const user = await User.create({
      name: 'Pri User', email: `pri-${Date.now()}@test.com`, phone: '050', password: 'hash',
      address: [
        { name: 'A1', city: 'Dubai', area: 'Marina', floorNo: '1', apartmentNo: '101', landmark: 'Near Mall', buildingName: 'T', mobile: '050', state: 'Dubai', country: 'AE', isPrimary: true },
        { name: 'A2', city: 'Abu Dhabi', area: 'Corniche', floorNo: '2', apartmentNo: '202', landmark: 'Near Mall', buildingName: 'U', mobile: '055', state: 'AD', country: 'AE', isPrimary: false },
      ],
    });
    const addr2Id = user.address[1]._id.toString();
    const result = await orderService.setPrimaryAddress(user._id.toString(), addr2Id);
    const primary = result.addresses.find(a => a._id.toString() === addr2Id);
    expect(primary.isPrimary).toBe(true);
  });
});

// ── getPaymentMethods ─────────────────────────────────────────────────────────

describe('orderService — getPaymentMethods', () => {
  it('returns tabby and stripe when TABBY_AUTH_KEY is set', async () => {
    const result = await orderService.getPaymentMethods();
    const ids = result.map(m => m.id);
    expect(ids).toContain('tabby');
    expect(ids).toContain('stripe');
  });

  it('returns nomod when NOMOD_ENABLED and NOMOD_API_KEY are set', async () => {
    process.env.NOMOD_ENABLED = 'true';
    process.env.NOMOD_API_KEY = 'fake-nomod-key';
    const result = await orderService.getPaymentMethods();
    expect(result.map(m => m.id)).toContain('nomod');
    delete process.env.NOMOD_ENABLED;
    delete process.env.NOMOD_API_KEY;
  });
});

// ── getPaymentIntent ────────────────────────────────────────────────────────

describe('orderService — getPaymentIntent', () => {
  it('returns data from stripe API', async () => {
    axios.get.mockResolvedValueOnce({ data: { id: 'pi_test', status: 'succeeded' } });
    const result = await orderService.getPaymentIntent();
    expect(result.id).toBe('pi_test');
  });
});
