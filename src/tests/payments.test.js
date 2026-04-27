'use strict';

// ─── Environment stubs (must be set before any require) ───────────────────────
process.env.STRIPE_SK = 'sk_test_fake';
process.env.TABBY_SECRET_KEY = 'tabby_fake';
process.env.ENVIRONMENT = 'false'; // skip inventory update branch

// ─── Mock: stripe (module-load-time constructor call) ─────────────────────────
const mockSessionsRetrieve = jest.fn();
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: { retrieve: mockSessionsRetrieve },
    },
    paymentIntents: { create: jest.fn() },
  }))
);

// ─── Mock: axios ──────────────────────────────────────────────────────────────
jest.mock('axios');
const axios = require('axios');

// ─── Mock: PaymentProviderFactory ─────────────────────────────────────────────
jest.mock('../services/payments/PaymentProviderFactory', () => ({
  create: jest.fn(),
}));
const PaymentProviderFactory = require('../services/payments/PaymentProviderFactory');

// ─── Mongoose model mocks ─────────────────────────────────────────────────────

// PendingPayment: used both as a constructor (new PendingPayment(...)) in Stripe
// path, and as findOne in Nomod path.
const mockPendingPaymentSave = jest.fn().mockResolvedValue(undefined);
const MockPendingPaymentConstructor = jest.fn().mockImplementation(function (data) {
  Object.assign(this, data);
  this.save = mockPendingPaymentSave;
});
MockPendingPaymentConstructor.findOne = jest.fn();
MockPendingPaymentConstructor.create = jest.fn();

jest.mock('../models/PendingPayment', () => MockPendingPaymentConstructor);

// Order: findOne must support two usage patterns:
//   1. await Order.findOne({ txn_id: ... })            → direct await (no chain)
//   2. await Order.findOne().sort(...).select(...)      → chained await
// We achieve this by returning an object that is both thenable AND has .sort().
const mockOrderSave = jest.fn().mockResolvedValue(undefined);
// mockOrderFindOneDirectResult: what a direct await of findOne resolves to
let mockOrderFindOneDirectResult = null;
// mockOrderSelectResult: what the sort/select chain resolves to
let mockOrderSelectResult = null;

function makeOrderQuery(directResult) {
  const p = Promise.resolve(directResult);
  p.sort = jest.fn(() => ({
    select: jest.fn(() => Promise.resolve(mockOrderSelectResult)),
  }));
  return p;
}

const mockOrderCreate = jest.fn();
const mockOrderFindOne = jest.fn(() => makeOrderQuery(mockOrderFindOneDirectResult));

jest.mock('../models/Order', () => ({
  findOne: mockOrderFindOne,
  create: mockOrderCreate,
}));

// OrderDetail
jest.mock('../models/OrderDetail', () => ({
  insertMany: jest.fn().mockResolvedValue([]),
}));

// CartData
jest.mock('../models/CartData', () => ({
  findById: jest.fn(),
}));
const CartData = require('../models/CartData');

// Coupon
const mockCouponSave = jest.fn().mockResolvedValue(undefined);
jest.mock('../models/Coupon', () => ({
  findOne: jest.fn(),
}));
const Coupon = require('../models/Coupon');

// BankPromoCode
const mockBankPromoSave = jest.fn().mockResolvedValue(undefined);
jest.mock('../models/BankPromoCode', () => ({
  findById: jest.fn(),
}));
const BankPromoCode = require('../models/BankPromoCode');

// BankPromoCodeUsage
jest.mock('../models/BankPromoCodeUsage', () => ({
  findOne: jest.fn(),
  create: jest.fn().mockResolvedValue({}),
}));
const BankPromoCodeUsage = require('../models/BankPromoCodeUsage');

// User
jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));
const User = require('../models/User');

// Notification
jest.mock('../models/Notification', () => ({
  create: jest.fn().mockResolvedValue({}),
}));

// Cart (required by the module even if not exercised in these paths)
jest.mock('../models/Cart', () => ({
  findOne: jest.fn(),
  deleteOne: jest.fn(),
}));

// Product
jest.mock('../models/Product', () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));

// ─── Utility / helper mocks ───────────────────────────────────────────────────
jest.mock('../mail/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utilities/emailHelper', () => ({
  getAdminEmail: jest.fn().mockResolvedValue('admin@test.com'),
  getCcEmails: jest.fn().mockResolvedValue([]),
}));
jest.mock('../utilities/activityLogger', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utilities/backendLogger', () => ({ logBackendActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utilities/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// ─── Import functions under test (after all mocks are set up) ─────────────────
const {
  verifyStripePayment,
  verifyTabbyPayment,
  verifyNomodPayment,
} = require('../services/checkoutService');

// ─── Shared test fixtures ──────────────────────────────────────────────────────
const FAKE_CART_DATA = [
  { id: 'prod1', product_id: 'prod1', name: 'Widget', variant: 'Red', price: 50, qty: 2, image: 'img.jpg' },
];

const FAKE_STRIPE_METADATA = {
  shippingCost: '10',
  name: 'Test User',
  phone: '0501234567',
  address: '123 Main St',
  currency: 'AED',
  totalAmount: '110',
  subTotalAmount: '100',
  city: 'Dubai',
  area: 'Downtown',
  buildingName: 'Tower A',
  floorNo: '5',
  apartmentNo: '501',
  landmark: 'Near Mall',
  couponCode: '',
  mobileNumber: '',
  paymentMethod: 'stripe',
  discountAmount: '0',
  saved_total: '0',
  bankPromoId: '',
  cartDataId: 'cartdata123',
  state: 'Dubai',
};

/** Returns a realistic Stripe session object */
function makeStripeSession(paymentStatus = 'paid', metaOverrides = {}) {
  return {
    id: 'cs_test_session123',
    payment_intent: 'pi_test_intent123',
    payment_status: paymentStatus,
    customer_details: { email: 'user@test.com' },
    metadata: { ...FAKE_STRIPE_METADATA, ...metaOverrides },
    orderTracks: [],
  };
}

/** Returns an Order-like object that Order.create resolves with */
function makeFakeOrder(overrides = {}) {
  return {
    _id: 'order_id_abc',
    order_id: 'BZ2026001XYZ',
    order_no: 1,
    name: 'Test User',
    amount_total: '110.00',
    orderTracks: [],
    save: mockOrderSave,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: set up the common "happy path" stubs for verifyStripePayment
// ─────────────────────────────────────────────────────────────────────────────
function setupStripeHappyPath(sessionOverrides = {}) {
  const session = makeStripeSession('paid', sessionOverrides);
  mockSessionsRetrieve.mockResolvedValue(session);
  CartData.findById.mockResolvedValue({ cartData: FAKE_CART_DATA });
  // verifyStripePayment calls Order.findOne().sort().select() for last order number
  mockOrderSelectResult = null; // no prior orders
  const fakeOrder = makeFakeOrder();
  mockOrderCreate.mockResolvedValue(fakeOrder);
  User.findById.mockResolvedValue({ _id: 'user123', name: 'Test User', email: 'user@test.com' });
  return { session, fakeOrder };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('verifyStripePayment', () => {
  beforeEach(() => jest.clearAllMocks());

  test('throws {status:400} when sessionId is falsy', async () => {
    expect.assertions(2);
    try {
      await verifyStripePayment(null, 'user123');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/session id/i);
    }
  });

  test('throws {status:400} when sessionId is an empty string', async () => {
    expect.assertions(1);
    try {
      await verifyStripePayment('', 'user123');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test('creates PendingPayment and Order when payment_status is "paid"', async () => {
    setupStripeHappyPath();

    const result = await verifyStripePayment('cs_test_session123', 'user123');

    expect(mockPendingPaymentSave).toHaveBeenCalledTimes(1);
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ message: 'Order created successfully' });
  });

  test('does NOT create an Order when payment_status is "unpaid"', async () => {
    mockSessionsRetrieve.mockResolvedValue(makeStripeSession('unpaid'));
    CartData.findById.mockResolvedValue({ cartData: FAKE_CART_DATA });

    expect.assertions(2);
    try {
      await verifyStripePayment('cs_test_session123', 'user123');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(mockOrderCreate).not.toHaveBeenCalled();
    }
  });

  test('marks coupon as "used" when couponCode and mobileNumber are in metadata', async () => {
    const mockCoupon = { coupon: 'SAVE10', phone: '0501234567', status: 'active', save: mockCouponSave };
    Coupon.findOne.mockResolvedValue(mockCoupon);
    setupStripeHappyPath({ couponCode: 'SAVE10', mobileNumber: '0501234567' });

    await verifyStripePayment('cs_test_session123', 'user123');

    expect(Coupon.findOne).toHaveBeenCalledWith({ coupon: 'SAVE10', phone: '0501234567' });
    expect(mockCoupon.status).toBe('used');
    expect(mockCouponSave).toHaveBeenCalled();
  });

  test('does NOT query Coupon when couponCode is absent', async () => {
    setupStripeHappyPath(); // metadata has couponCode: ''

    await verifyStripePayment('cs_test_session123', 'user123');

    expect(Coupon.findOne).not.toHaveBeenCalled();
  });

  test('returns successfully even when PendingPayment with same paymentId already has status="completed" (idempotency stub)', async () => {
    // The service constructs a *new* PendingPayment on the paid path — it does not
    // check for an existing one. Idempotency is enforced at the DB level (duplicate
    // key). We verify the service still resolves successfully when save succeeds.
    setupStripeHappyPath();

    const result = await verifyStripePayment('cs_test_session123', 'user123');

    expect(result).toMatchObject({ message: 'Order created successfully' });
    expect(mockPendingPaymentSave).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('verifyTabbyPayment', () => {
  beforeEach(() => jest.clearAllMocks());

  // Helper: build a Tabby payment object
  // createOrderAndSendEmails reads: payment.meta.cartDataId, payment.meta.subtotalAmount,
  // payment.amount, payment.buyer, payment.shipping_address, payment.order, payment.id
  function makeTabbyPayment(status, amount = '110.00') {
    return {
      status,
      amount,
      id: 'tabby_pay_abc',
      buyer: { name: 'Test User', email: 'user@test.com', phone: '0501234567' },
      shipping_address: { city: 'Dubai', address: '123 Main St' },
      order_history: [],
      order: {
        shipping_amount: 10,
        discount_amount: 0,
        items: FAKE_CART_DATA.map(i => ({ ...i, unit_price: i.price, quantity: i.qty })),
      },
      meta: {
        cartDataId: 'cartdata123',
        subtotalAmount: '100',
        city: 'Dubai',
        area: 'Downtown',
        couponCode: '',
        mobileNumber: '',
        paymentMethod: 'tabby',
      },
    };
  }

  // Set up the createOrderAndSendEmails dependencies used inside verifyTabbyPayment
  // createOrderAndSendEmails calls:
  //   1. Order.findOne({ txn_id }) → null (no existing order, direct await)
  //   2. CartData.findById(cartDataId) → cart entry
  //   3. Order.findOne().sort().select() → null (no prior order for numbering)
  //   4. Order.create(...) → new order
  function setupTabbyOrderCreationStubs() {
    // Direct await of findOne (idempotency check) must return null
    mockOrderFindOneDirectResult = null;
    // Chained .sort().select() (last order number lookup) must return null
    mockOrderSelectResult = null;
    const fakeOrder = makeFakeOrder();
    mockOrderCreate.mockResolvedValue(fakeOrder);
    User.findById.mockResolvedValue({ _id: 'user123', email: 'user@test.com' });
    CartData.findById.mockResolvedValue({ cartData: FAKE_CART_DATA });
    return fakeOrder;
  }

  test('throws {status:400} when paymentId is falsy', async () => {
    expect.assertions(2);
    try {
      await verifyTabbyPayment(null, 'user123');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/paymentId/i);
    }
  });

  test('throws {status:400} when paymentId is an empty string', async () => {
    expect.assertions(1);
    try {
      await verifyTabbyPayment('', 'user123');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test('calls capture endpoint and creates order when Tabby status is AUTHORIZED', async () => {
    const payment = makeTabbyPayment('AUTHORIZED');
    axios.get = jest.fn().mockResolvedValue({ data: payment });
    axios.post = jest.fn().mockResolvedValue({ data: { status: 'CLOSED' } });
    setupTabbyOrderCreationStubs();

    const result = await verifyTabbyPayment('tabby_pay_abc', 'user123');

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/captures'),
      expect.objectContaining({ amount: payment.amount }),
      expect.any(Object)
    );
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ message: 'Order created successfully' });
  });

  test('throws {status:500, message:"Capture failed"} when capture returns non-CLOSED status', async () => {
    const payment = makeTabbyPayment('AUTHORIZED');
    axios.get = jest.fn().mockResolvedValue({ data: payment });
    axios.post = jest.fn().mockResolvedValue({ data: { status: 'FAILED' } });

    expect.assertions(2);
    try {
      await verifyTabbyPayment('tabby_pay_abc', 'user123');
    } catch (err) {
      expect(err.status).toBe(500);
      expect(err.message).toBe('Capture failed');
    }
  });

  test('skips capture and creates order directly when Tabby status is CLOSED', async () => {
    const payment = makeTabbyPayment('CLOSED');
    axios.get = jest.fn().mockResolvedValue({ data: payment });
    setupTabbyOrderCreationStubs();

    const result = await verifyTabbyPayment('tabby_pay_abc', 'user123');

    expect(axios.post).not.toHaveBeenCalled();
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ message: 'Order created successfully' });
  });

  test('throws {status:400} when Tabby payment status is REJECTED', async () => {
    const payment = makeTabbyPayment('REJECTED');
    axios.get = jest.fn().mockResolvedValue({ data: payment });

    expect.assertions(2);
    try {
      await verifyTabbyPayment('tabby_pay_abc', 'user123');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/REJECTED/);
    }
  });

  test('throws {status:400} when Tabby payment status is EXPIRED', async () => {
    const payment = makeTabbyPayment('EXPIRED');
    axios.get = jest.fn().mockResolvedValue({ data: payment });

    expect.assertions(1);
    try {
      await verifyTabbyPayment('tabby_pay_abc', 'user123');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test('records bank promo usage when bankPromoId is provided and usage does not yet exist', async () => {
    const payment = makeTabbyPayment('CLOSED');
    axios.get = jest.fn().mockResolvedValue({ data: payment });
    setupTabbyOrderCreationStubs();

    const mockPromo = { _id: 'promo1', code: 'BANK10', usageCount: 0, save: mockBankPromoSave };
    BankPromoCode.findById.mockResolvedValue(mockPromo);
    BankPromoCodeUsage.findOne.mockResolvedValue(null); // no existing usage

    await verifyTabbyPayment('tabby_pay_abc', 'user123', 'promo1');

    expect(BankPromoCodeUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ bankPromoCodeId: 'promo1', userId: 'user123' })
    );
    expect(mockBankPromoSave).toHaveBeenCalled();
    expect(mockPromo.usageCount).toBe(1);
  });

  test('does NOT record bank promo usage when usage already exists', async () => {
    const payment = makeTabbyPayment('CLOSED');
    axios.get = jest.fn().mockResolvedValue({ data: payment });
    setupTabbyOrderCreationStubs();

    const mockPromo = { _id: 'promo1', code: 'BANK10', usageCount: 1, save: mockBankPromoSave };
    BankPromoCode.findById.mockResolvedValue(mockPromo);
    BankPromoCodeUsage.findOne.mockResolvedValue({ _id: 'usage_existing' }); // already used

    await verifyTabbyPayment('tabby_pay_abc', 'user123', 'promo1');

    expect(BankPromoCodeUsage.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('verifyNomodPayment', () => {
  beforeEach(() => jest.clearAllMocks());

  const FAKE_USER_ID = 'user_nomod_123';

  function makeReq(bodyOverrides = {}, user = { _id: FAKE_USER_ID }) {
    return {
      body: { paymentId: 'nomod_pay_abc', ...bodyOverrides },
      user,
    };
  }

  /** Returns a PendingPayment-like doc with a save stub */
  function makePendingDoc(status = 'pending') {
    return {
      _id: 'pending_id_1',
      payment_id: 'nomod_pay_abc',
      status,
      order_data: {
        cartData: FAKE_CART_DATA,
        shippingCost: 10,
        name: 'Test User',
        phone: '0501234567',
        address: '123 Main St',
        city: 'Dubai',
        area: 'Downtown',
        buildingName: 'Tower A',
        floorNo: '5',
        apartmentNo: '501',
        landmark: 'Near Mall',
        currency: 'AED',
        discountAmount: '0',
        couponCode: '',
        mobileNumber: '',
        saved_total: '0',
        bankPromoId: '',
        subtotalAmount: '100',
        totalAmount: '110',
      },
      save: jest.fn().mockResolvedValue(undefined),
    };
  }

  function setupNomodHappyPath(pendingStatus = 'pending') {
    const mockProvider = { getCheckout: jest.fn().mockResolvedValue({ paid: true, status: 'closed' }) };
    PaymentProviderFactory.create.mockReturnValue(mockProvider);

    const pendingDoc = makePendingDoc(pendingStatus);
    MockPendingPaymentConstructor.findOne.mockResolvedValue(pendingDoc);

    // verifyNomodPayment calls Order.findOne().sort().select() for last order number
    mockOrderSelectResult = null;
    const fakeOrder = makeFakeOrder();
    mockOrderCreate.mockResolvedValue(fakeOrder);
    User.findById.mockResolvedValue({ _id: FAKE_USER_ID, email: 'user@test.com' });

    return { mockProvider, pendingDoc, fakeOrder };
  }

  test('throws {status:400} when req.body.paymentId is falsy', async () => {
    expect.assertions(2);
    try {
      await verifyNomodPayment(makeReq({ paymentId: undefined }));
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/paymentId/i);
    }
  });

  test('throws {status:400} when req.body.paymentId is an empty string', async () => {
    expect.assertions(1);
    try {
      await verifyNomodPayment(makeReq({ paymentId: '' }));
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test('throws {status:400, message containing status} when checkout.paid is false', async () => {
    const mockProvider = {
      getCheckout: jest.fn().mockResolvedValue({ paid: false, status: 'created' }),
    };
    PaymentProviderFactory.create.mockReturnValue(mockProvider);

    expect.assertions(2);
    try {
      await verifyNomodPayment(makeReq());
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toContain('created');
    }
  });

  test('throws {status:404} when checkout is paid but PendingPayment record not found', async () => {
    const mockProvider = {
      getCheckout: jest.fn().mockResolvedValue({ paid: true, status: 'closed' }),
    };
    PaymentProviderFactory.create.mockReturnValue(mockProvider);
    MockPendingPaymentConstructor.findOne.mockResolvedValue(null);

    expect.assertions(1);
    try {
      await verifyNomodPayment(makeReq());
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });

  test('returns {message:"Order already created"} without creating Order when PendingPayment is already "completed"', async () => {
    setupNomodHappyPath('completed');

    const result = await verifyNomodPayment(makeReq());

    expect(result).toEqual({ message: 'Order already created' });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  test('happy path: marks PendingPayment as completed and creates Order', async () => {
    const { pendingDoc } = setupNomodHappyPath('pending');

    const result = await verifyNomodPayment(makeReq());

    expect(pendingDoc.status).toBe('completed');
    expect(pendingDoc.save).toHaveBeenCalled();
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ message: 'Order created successfully' });
  });

  test('happy path: Order.create is called with nomod payment_method', async () => {
    setupNomodHappyPath('pending');

    await verifyNomodPayment(makeReq());

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'nomod', payment_status: 'paid' })
    );
  });

  test('calls PaymentProviderFactory.create with "nomod"', async () => {
    setupNomodHappyPath('pending');

    await verifyNomodPayment(makeReq());

    expect(PaymentProviderFactory.create).toHaveBeenCalledWith('nomod');
  });

  test('calls provider.getCheckout with the paymentId from req.body', async () => {
    const { mockProvider } = setupNomodHappyPath('pending');

    await verifyNomodPayment(makeReq({ paymentId: 'nomod_pay_abc' }));

    expect(mockProvider.getCheckout).toHaveBeenCalledWith('nomod_pay_abc');
  });
});
