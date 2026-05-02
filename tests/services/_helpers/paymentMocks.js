'use strict';
/**
 * Shared payment + external-API mock harness for service tests.
 *
 * Usage:
 *   const { mockStripe, mockTabby, mockNomod, mockLightspeed } = require('./_helpers/paymentMocks');
 *
 *   // In module-level jest.mock() calls:
 *   jest.mock('stripe', () => jest.fn(() => mockStripe()));
 *   jest.mock('axios');
 *
 *   // In beforeEach:
 *   mockLightspeed.setInStock(15);
 *   mockTabby.setStatus('CLOSED');
 */

// ─── Stripe ────────────────────────────────────────────────────────────────

let _stripeInstance = null;

function mockStripe() {
  const sessions = {
    _behavior: 'success',
    create: jest.fn(async () => {
      if (sessions._behavior === 'network-error') throw new Error('Stripe network error');
      if (sessions._behavior === 'decline') throw { type: 'StripeCardError', message: 'Your card was declined.' };
      return {
        id: 'cs_test_mock_123',
        url: 'https://checkout.stripe.com/mock',
        payment_status: 'unpaid',
        amount_total: 10000,
        currency: 'aed',
        metadata: {},
      };
    }),
    retrieve: jest.fn(async (sessionId) => {
      if (sessions._behavior === 'network-error') throw new Error('Stripe network error');
      if (sessions._behavior === 'unpaid') {
        return { id: sessionId, payment_status: 'unpaid', metadata: {} };
      }
      return {
        id: sessionId,
        payment_status: 'paid',
        payment_intent: 'pi_mock_123',
        customer_details: { email: 'buyer@test.com' },
        amount_total: 10000,
        currency: 'aed',
        metadata: {
          cartDataId: 'mock-cart-id',
          name: 'Test Buyer',
          phone: '0501234567',
          address: 'Dubai Marina',
          city: 'Dubai',
          area: 'Marina',
          shippingCost: '30',
          currency: 'aed',
          totalAmount: '130.00',
          subTotalAmount: '100.00',
          couponCode: '',
          mobileNumber: '',
          paymentMethod: 'card',
          discountAmount: '0',
          bankPromoId: '',
          saved_total: '0',
        },
      };
    }),
    expire: jest.fn(async () => ({ id: 'cs_expired', status: 'expired' })),
  };

  const paymentIntents = {
    _behavior: 'success',
    create: jest.fn(async (opts) => {
      if (paymentIntents._behavior === 'network-error') throw new Error('Stripe network error');
      return { id: 'pi_mock_create_123', status: 'requires_payment_method', amount: opts.amount, currency: opts.currency };
    }),
    retrieve: jest.fn(async (id) => ({
      id,
      status: 'succeeded',
      amount: 10000,
      currency: 'aed',
    })),
    refund: jest.fn(async () => ({ id: 're_mock', status: 'succeeded' })),
  };

  const coupons = {
    create: jest.fn(async () => ({ id: 'coupon_mock_id', percent_off: 10, duration: 'once' })),
  };

  const webhooks = {
    constructEvent: jest.fn((rawBody, sig, secret) => {
      if (sig === 'invalid') throw new Error('Webhook signature verification failed.');
      return JSON.parse(rawBody.toString());
    }),
  };

  _stripeInstance = { checkout: { sessions }, paymentIntents, coupons, webhooks };
  return _stripeInstance;
}

/** Set session create/retrieve behavior — call before test */
mockStripe.setBehavior = (scope, behavior) => {
  if (!_stripeInstance) return;
  if (scope === 'sessions') _stripeInstance.checkout.sessions._behavior = behavior;
  if (scope === 'paymentIntents') _stripeInstance.paymentIntents._behavior = behavior;
};

mockStripe.reset = () => {
  if (!_stripeInstance) return;
  _stripeInstance.checkout.sessions._behavior = 'success';
  _stripeInstance.paymentIntents._behavior = 'success';
  Object.values(_stripeInstance.checkout.sessions)
    .filter(v => typeof v === 'function' && v.mockReset)
    .forEach(fn => fn.mockReset && fn.mockReset());
};

mockStripe.getInstance = () => _stripeInstance;

// ─── Tabby (axios-based) ───────────────────────────────────────────────────

const mockTabby = {
  _status: 'CLOSED',
  _captureStatus: 'CLOSED',

  setStatus(status) { this._status = status; },
  setCaptureStatus(status) { this._captureStatus = status; },
  reset() { this._status = 'CLOSED'; this._captureStatus = 'CLOSED'; },

  /**
   * Install Tabby responses onto an already-mocked axios instance.
   * Call this inside a beforeEach after `jest.mock('axios')`.
   *
   * @param {jest.Mock} axiosGet  - the axios.get mock fn
   * @param {jest.Mock} axiosPost - the axios.post mock fn
   */
  install(axiosGet, axiosPost) {
    const self = this;
    axiosGet.mockImplementation(async (url) => {
      if (url && url.includes('tabby.ai') && url.includes('/payments/')) {
        return { data: { status: self._status, amount: '100.00', id: 'pay_tabby_mock' } };
      }
      return { data: {} };
    });
    axiosPost.mockImplementation(async (url) => {
      if (url && url.includes('tabby.ai') && url.includes('/captures')) {
        return { data: { status: self._captureStatus } };
      }
      return { data: {} };
    });
  },
};

// ─── Nomod ─────────────────────────────────────────────────────────────────

const mockNomod = {
  _paid: true,
  _status: 'paid',
  _checkoutId: 'chk_nomod_mock',
  _redirectUrl: 'https://pay.nomod.com/chk_nomod_mock',

  setResult({ paid, status, checkoutId, redirectUrl } = {}) {
    if (paid !== undefined) this._paid = paid;
    if (status !== undefined) this._status = status;
    if (checkoutId !== undefined) this._checkoutId = checkoutId;
    if (redirectUrl !== undefined) this._redirectUrl = redirectUrl;
  },
  reset() {
    this._paid = true;
    this._status = 'paid';
    this._checkoutId = 'chk_nomod_mock';
    this._redirectUrl = 'https://pay.nomod.com/chk_nomod_mock';
  },

  /** Returns a mock provider object wired to current settings */
  buildProvider() {
    const self = this;
    return {
      createCheckout: jest.fn(async () => ({
        id: self._checkoutId,
        redirectUrl: self._redirectUrl,
      })),
      getCheckout: jest.fn(async () => ({
        paid: self._paid,
        status: self._status,
        id: self._checkoutId,
        metadata: {},
      })),
    };
  },
};

// ─── Lightspeed (axios-based inventory + product) ──────────────────────────

const mockLightspeed = {
  _inventoryLevel: 10,
  _productBehavior: 'success',
  _productData: null,

  setInStock(qty) { this._inventoryLevel = qty; },
  setProductBehavior(behavior) { this._productBehavior = behavior; },
  setProductData(data) { this._productData = data; },
  reset() {
    this._inventoryLevel = 10;
    this._productBehavior = 'success';
    this._productData = null;
  },

  /**
   * Returns an axios.get mock implementation that handles Lightspeed inventory
   * and product API URLs. Merge with other per-test overrides as needed.
   */
  getAxiosGetImpl() {
    const self = this;
    return async (url) => {
      if (url && url.includes('/inventory')) {
        if (self._productBehavior === 'timeout') throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
        if (self._productBehavior === '5xx') throw { response: { status: 503 }, message: 'Service Unavailable' };
        return { data: { data: [{ inventory_level: self._inventoryLevel }] } };
      }
      if (url && url.includes('/products/')) {
        if (self._productBehavior === '404') throw { response: { status: 404 }, message: 'Not Found' };
        if (self._productBehavior === 'timeout') throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
        if (self._productBehavior === '5xx') throw { response: { status: 503 }, message: 'Service Unavailable' };
        return { data: { data: self._productData || { id: 'ls-prod-1', name: 'Mock LS Product', variants: [] } } };
      }
      return { data: {} };
    };
  },
};

module.exports = { mockStripe, mockTabby, mockNomod, mockLightspeed };
