require('../../../setup');
'use strict';

/**
 * Predicate unit tests — one describe block per predicate.
 */

const EligibilityVerdict = require('../../../../src/services/coupon/domain/EligibilityVerdict');
const REASONS = require('../../../../src/services/coupon/domain/rejection-reasons');

// Force registry registration
require('../../../../src/services/coupon/predicates/index');

const minSubtotal = require('../../../../src/services/coupon/predicates/MinSubtotal');
const firstOrder = require('../../../../src/services/coupon/predicates/FirstOrder');
const userSegment = require('../../../../src/services/coupon/predicates/UserSegment');
const categoryIn = require('../../../../src/services/coupon/predicates/CategoryIn');
const productIn = require('../../../../src/services/coupon/predicates/ProductIn');
const verticalIn = require('../../../../src/services/coupon/predicates/VerticalIn');
const schedule = require('../../../../src/services/coupon/predicates/Schedule');
const paymentMethodIn = require('../../../../src/services/coupon/predicates/PaymentMethodIn');
const maxQuantity = require('../../../../src/services/coupon/predicates/MaxQuantity');
const geo = require('../../../../src/services/coupon/predicates/Geo');
const platformIn = require('../../../../src/services/coupon/predicates/PlatformIn');

// ── MinSubtotal ───────────────────────────────────────────────────

describe('MinSubtotal predicate', () => {
  const rule = { type: 'min_subtotal', amount: 100 };

  it('passes when subtotal equals minimum (boundary)', () => {
    const v = minSubtotal(rule, { subtotal: 100 });
    expect(v.eligible).toBe(true);
  });

  it('passes when subtotal exceeds minimum', () => {
    const v = minSubtotal(rule, { subtotal: 200 });
    expect(v.eligible).toBe(true);
  });

  it('rejects when subtotal is below minimum', () => {
    const v = minSubtotal(rule, { subtotal: 99.99 });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.BELOW_MINIMUM);
    expect(v.recoverable).toBe(true);
  });

  it('rejects with subtotal = 0', () => {
    const v = minSubtotal(rule, { subtotal: 0 });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.BELOW_MINIMUM);
  });

  it('passes when minimum is 0', () => {
    const v = minSubtotal({ type: 'min_subtotal', amount: 0 }, { subtotal: 0 });
    expect(v.eligible).toBe(true);
  });
});

// ── FirstOrder ────────────────────────────────────────────────────
// FirstOrder is now async (queries DB server-side). These unit-level smoke
// tests mock the Order model; the full DB-backed coverage lives in firstOrder.test.js.

describe('FirstOrder predicate', () => {
  const rule = { type: 'first_order' };

  beforeEach(() => {
    // Mock the repositories to avoid real DB calls in this unit test file.
    const repos = require('../../../../src/repositories');
    jest.spyOn(repos.orders, 'rawModel').mockReturnValue({
      countDocuments: jest.fn().mockResolvedValue(0), // default: no prior orders
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes when no prior orders exist for the phone', async () => {
    const v = await firstOrder(rule, { phone: '+971501234567' });
    expect(v.eligible).toBe(true);
  });

  it('rejects when prior orders exist (ignores client is_first_order:true)', async () => {
    const repos = require('../../../../src/repositories');
    repos.orders.rawModel().countDocuments.mockResolvedValue(1);

    const v = await firstOrder(rule, { phone: '+971501234567', is_first_order: true });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.FIRST_ORDER_ONLY);
  });

  it('rejects conservatively when phone is absent', async () => {
    const v = await firstOrder(rule, {});
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.FIRST_ORDER_ONLY);
  });
});

// ── UserSegment ───────────────────────────────────────────────────

describe('UserSegment predicate', () => {
  const rule = { type: 'user_segment', segments: ['vip', 'premium'] };

  it('passes when user is in allowed segments', () => {
    const v = userSegment(rule, { user_segment: 'vip' });
    expect(v.eligible).toBe(true);
  });

  it('rejects when user is not in allowed segments', () => {
    const v = userSegment(rule, { user_segment: 'regular' });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });

  it('passes when segments list is empty (open to all)', () => {
    const v = userSegment({ type: 'user_segment', segments: [] }, { user_segment: 'anyone' });
    expect(v.eligible).toBe(true);
  });
});

// ── CategoryIn ────────────────────────────────────────────────────

describe('CategoryIn predicate', () => {
  const rule = { type: 'category_in', categories: ['cat1', 'cat2'] };

  it('passes when cart contains an item from allowed category', () => {
    const v = categoryIn(rule, { items: [{ category_id: 'cat1', product_id: 'p1' }] });
    expect(v.eligible).toBe(true);
  });

  it('rejects when no cart items match', () => {
    const v = categoryIn(rule, { items: [{ category_id: 'cat99', product_id: 'p9' }] });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });

  it('rejects with empty items array', () => {
    const v = categoryIn(rule, { items: [] });
    expect(v.eligible).toBe(false);
  });

  it('passes when categories list is empty', () => {
    const v = categoryIn({ type: 'category_in', categories: [] }, { items: [] });
    expect(v.eligible).toBe(true);
  });
});

// ── ProductIn ─────────────────────────────────────────────────────

describe('ProductIn predicate', () => {
  const rule = { type: 'product_in', product_ids: ['prod1', 'prod2'] };

  it('passes when cart contains a matching product', () => {
    const v = productIn(rule, { items: [{ product_id: 'prod1' }] });
    expect(v.eligible).toBe(true);
  });

  it('rejects when cart has no matching product', () => {
    const v = productIn(rule, { items: [{ product_id: 'prod99' }] });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });
});

// ── VerticalIn ────────────────────────────────────────────────────

describe('VerticalIn predicate', () => {
  const rule = { type: 'vertical_in', verticals: ['fashion', 'beauty'] };

  it('passes when vertical matches', () => {
    const v = verticalIn(rule, { vertical: 'fashion' });
    expect(v.eligible).toBe(true);
  });

  it('rejects when vertical does not match', () => {
    const v = verticalIn(rule, { vertical: 'electronics' });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });

  it('passes when verticals list is empty', () => {
    const v = verticalIn({ type: 'vertical_in', verticals: [] }, { vertical: 'anything' });
    expect(v.eligible).toBe(true);
  });
});

// ── Schedule ──────────────────────────────────────────────────────

describe('Schedule predicate', () => {
  const pastWindow = { start: '2020-01-01T00:00:00Z', end: '2020-12-31T23:59:59Z' };
  const futureWindow = { start: '2099-01-01T00:00:00Z', end: '2099-12-31T23:59:59Z' };
  const nowWindow = {
    start: new Date(Date.now() - 10000).toISOString(),
    end: new Date(Date.now() + 10000).toISOString(),
  };

  it('passes when current time is within a window', () => {
    const v = schedule({ type: 'schedule', windows: [nowWindow] }, {});
    expect(v.eligible).toBe(true);
  });

  it('rejects when current time is outside all windows', () => {
    const v = schedule({ type: 'schedule', windows: [pastWindow, futureWindow] }, {});
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });

  it('passes when no windows defined', () => {
    const v = schedule({ type: 'schedule', windows: [] }, {});
    expect(v.eligible).toBe(true);
  });

  it('uses ctx.now when provided', () => {
    const fixedNow = new Date('2020-06-15T12:00:00Z');
    const v = schedule({ type: 'schedule', windows: [pastWindow] }, { now: fixedNow });
    expect(v.eligible).toBe(true);
  });
});

// ── PaymentMethodIn ───────────────────────────────────────────────

describe('PaymentMethodIn predicate', () => {
  const rule = { type: 'payment_method_in', methods: ['card', 'tabby'] };

  it('passes when payment method is allowed', () => {
    const v = paymentMethodIn(rule, { payment_method: 'card' });
    expect(v.eligible).toBe(true);
  });

  it('rejects when payment method is not allowed', () => {
    const v = paymentMethodIn(rule, { payment_method: 'cash' });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });
});

// ── MaxQuantity ───────────────────────────────────────────────────

describe('MaxQuantity predicate', () => {
  const rule = { type: 'max_quantity', max: 3 };

  it('passes when total quantity <= max', () => {
    const items = [{ quantity: 2 }, { quantity: 1 }];
    const v = maxQuantity(rule, { items });
    expect(v.eligible).toBe(true);
  });

  it('passes exactly at max (boundary)', () => {
    const items = [{ quantity: 3 }];
    const v = maxQuantity(rule, { items });
    expect(v.eligible).toBe(true);
  });

  it('rejects when total quantity > max', () => {
    const items = [{ quantity: 2 }, { quantity: 2 }];
    const v = maxQuantity(rule, { items });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });
});

// ── Geo ───────────────────────────────────────────────────────────

describe('Geo predicate', () => {
  const rule = { type: 'geo', countries: ['AE', 'SA'] };

  it('passes when country is in allowed list', () => {
    const v = geo(rule, { country: 'AE' });
    expect(v.eligible).toBe(true);
  });

  it('passes case-insensitively', () => {
    const v = geo(rule, { country: 'ae' });
    expect(v.eligible).toBe(true);
  });

  it('rejects when country is not in allowed list', () => {
    const v = geo(rule, { country: 'GB' });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.NOT_ELIGIBLE);
  });

  it('passes when countries list is empty', () => {
    const v = geo({ type: 'geo', countries: [] }, { country: 'US' });
    expect(v.eligible).toBe(true);
  });
});

// ── PlatformIn ────────────────────────────────────────────────────

describe('PlatformIn predicate', () => {
  it('passes when ctx.platform is in the allowed list', () => {
    const v = platformIn({ type: 'platform_in', platforms: ['mobile'] }, { platform: 'mobile' });
    expect(v.eligible).toBe(true);
  });

  it('passes when allowed list includes both web and mobile', () => {
    const rule = { type: 'platform_in', platforms: ['web', 'mobile'] };
    expect(platformIn(rule, { platform: 'web' }).eligible).toBe(true);
    expect(platformIn(rule, { platform: 'mobile' }).eligible).toBe(true);
  });

  it('rejects when ctx.platform is not in the allowed list', () => {
    const v = platformIn({ type: 'platform_in', platforms: ['mobile'] }, { platform: 'web' });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.PLATFORM_NOT_ELIGIBLE);
    expect(v.recoverable).toBe(false);
  });

  it('rejects when ctx.platform is missing and the rule is restrictive', () => {
    const v = platformIn({ type: 'platform_in', platforms: ['mobile'] }, {});
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe(REASONS.PLATFORM_NOT_ELIGIBLE);
  });

  it('passes when the platforms array is empty (misconfigured rule does not block)', () => {
    const v = platformIn({ type: 'platform_in', platforms: [] }, { platform: 'web' });
    expect(v.eligible).toBe(true);
  });

  it('passes when platforms is missing entirely', () => {
    const v = platformIn({ type: 'platform_in' }, { platform: 'web' });
    expect(v.eligible).toBe(true);
  });

  it('is registered under the "platform_in" type', () => {
    const registry = require('../../../../src/services/coupon/predicates/index');
    expect(registry.get('platform_in')).toBe(platformIn);
  });
});
