'use strict';

/**
 * getCart — V2 auto-gift path tests.
 *
 * Tests the V2 code path (CART_GIFT_V2_ENABLED=true) by overriding the
 * runtime flag directly on the imported config object.  The legacy path
 * is guarded by a single smoke test.
 *
 * All I/O is mocked — no Mongo or Redis connections needed.
 */

// ── mock all side-effectful dependencies ──────────────────────────────────────

const mockFindOne = jest.fn();

jest.mock('../../../../src/repositories', () => ({
  carts: { rawModel: () => ({ findOne: mockFindOne }) },
}));

jest.mock('../../../../src/services/cart/domain/categoryMap', () => ({
  buildCategoryMap: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock('../../../../src/services/cart/domain/giftProduct', () => ({
  getGiftProductInfo: jest.fn(),
  GIFT_THRESHOLD_DEFAULT_AED: 400,
}));

jest.mock('../../../../src/services/cart/domain/autoCoupons', () => ({
  resolveAutoGift: jest.fn(),
  nextGiftThreshold: jest.fn(),
}));

jest.mock('../../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getCart } = require('../../../../src/services/cart/use-cases/getCart');
const runtime = require('../../../../src/config/runtime');
const { resolveAutoGift, nextGiftThreshold } = require('../../../../src/services/cart/domain/autoCoupons');
const { getGiftProductInfo } = require('../../../../src/services/cart/domain/giftProduct');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a cart item object with toObject() method (mirrors Mongoose behaviour).
 */
function cartItem(productIdStr, variantPrice = '100', qty = 1) {
  const obj = {
    product: {
      _id: { toString: () => productIdStr },
      product: { name: 'Product', product_type_id: null },
    },
    quantity: qty,
    variantId: 'v1',
    variantName: 'Default',
    variantPrice,
    name: 'Product',
    image: 'img.jpg',
    originalPrice: variantPrice,
    productId: productIdStr,
    totalAvailableQty: '10',
  };
  return { ...obj, toObject: () => ({ ...obj }) };
}

/** Return a chainable Cart.findOne stub that resolves to a cart with `items`. */
function mockCartWith(items) {
  const doc = { items };
  mockFindOne.mockReturnValue({
    read: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue(doc),
  });
}

/** Return a Cart.findOne stub that resolves to null (no cart). */
function mockCartNull() {
  mockFindOne.mockReturnValue({
    read: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue(null),
  });
}

/** Build a fake autoGift result from resolveAutoGift. */
function fakeAutoGiftResult(giftProductIdStr = 'gift-001', giftName = 'Free Gift') {
  return {
    coupon: {
      reward: {
        type: 'free_gift',
        gift_product_id: giftProductIdStr,
        gift_product_name: giftName,
        gift_variant_id: 'gv1',
      },
      stack_group: 'gift',
      metadata: { slot: 'cart_threshold_gift' },
      priority: 100,
    },
    discount: { aed: 0 },
  };
}

/** Fields the legacy path always returns — mobile parity contract. */
const LEGACY_FIELDS = [
  'cartCount',
  'cart',
  'cartSubtotal',
  'giftEligible',
  'giftAdded',
  'giftProductInStock',
  'promoMessage',
];

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  // Enable V2 flag by mutating the frozen config object via Object.defineProperty.
  // runtime config is a frozen plain Object.freeze; we must use defineProperty.
  Object.defineProperty(runtime.flags, 'cartGiftV2Enabled', {
    configurable: true,
    writable: true,
    value: true,
  });

  jest.clearAllMocks();
});

afterEach(() => {
  // Restore flag to default off state after each test.
  Object.defineProperty(runtime.flags, 'cartGiftV2Enabled', {
    configurable: true,
    writable: true,
    value: false,
  });
});

// ── Test cases ────────────────────────────────────────────────────────────────

describe('getCart — V2 auto-gift path', () => {

  // 1. Engine returns a matching coupon ─────────────────────────────────────────
  it('giftAdded=true and gift line appended when engine returns a qualifying coupon', async () => {
    const regularId = 'reg-001';
    const giftId = 'gift-001';

    mockCartWith([cartItem(regularId, '200', 3)]); // subtotal 600
    resolveAutoGift.mockResolvedValue(fakeAutoGiftResult(giftId, 'Free Gift'));
    nextGiftThreshold.mockResolvedValue(null);

    const result = await getCart('user1', { includeGiftLogic: true });

    expect(result.giftAdded).toBe(true);
    expect(result.giftEligible).toBe(true);
    const giftLine = result.cart.find((i) => i.isGiftWithPurchase === true);
    expect(giftLine).toBeDefined();
    expect(giftLine.price).toBe('0');
    expect(giftLine.variantPrice).toBe('0');
  });

  // 2. Engine returns null — hint from nextGiftThreshold ────────────────────────
  it('giftAdded=false with promoMessage hint when engine returns null', async () => {
    const regularId = 'reg-002';

    mockCartWith([cartItem(regularId, '100', 1)]); // subtotal 100
    resolveAutoGift.mockResolvedValue(null);
    nextGiftThreshold.mockResolvedValue({ threshold: 400, gift_name: 'Free Gift' });

    const result = await getCart('user2', { includeGiftLogic: true });

    expect(result.giftAdded).toBe(false);
    expect(result.giftEligible).toBe(false);
    expect(result.promoMessage).toMatch(/AED 400/);
  });

  // 3. Gift product already in cart — price flipped, no duplicate ───────────────
  it('flips existing gift item price to 0, does not append a duplicate line', async () => {
    const giftId = 'gift-003';

    mockCartWith([
      cartItem('reg-003', '200', 3),
      cartItem(giftId, '50', 1), // gift already in cart as paid item
    ]);
    resolveAutoGift.mockResolvedValue(fakeAutoGiftResult(giftId, 'Free Gift'));
    nextGiftThreshold.mockResolvedValue(null);

    const result = await getCart('user3', { includeGiftLogic: true });

    const giftLines = result.cart.filter((i) => i.isGiftWithPurchase === true);
    expect(giftLines).toHaveLength(1); // no duplicate
    expect(giftLines[0].price).toBe('0');
    expect(giftLines[0].variantPrice).toBe('0');
  });

  // 4. Flag OFF — legacy path smoke test ────────────────────────────────────────
  it('uses legacy getGiftProductInfo when CART_GIFT_V2_ENABLED is false', async () => {
    // Override flag to OFF for this test
    Object.defineProperty(runtime.flags, 'cartGiftV2Enabled', {
      configurable: true,
      writable: true,
      value: false,
    });

    getGiftProductInfo.mockResolvedValue(null);

    mockCartWith([cartItem('reg-004', '100', 1)]);

    const result = await getCart('user4', { includeGiftLogic: true });

    // V2 engine must NOT have been called
    expect(resolveAutoGift).not.toHaveBeenCalled();
    expect(nextGiftThreshold).not.toHaveBeenCalled();
    // Legacy path calls getGiftProductInfo
    expect(getGiftProductInfo).toHaveBeenCalled();
    // All legacy fields present
    LEGACY_FIELDS.forEach((f) => expect(result).toHaveProperty(f));
  });

  // 5. V2 response field parity ──────────────────────────────────────────────────
  it('V2 response has every field the legacy response has (parity contract)', async () => {
    mockCartWith([cartItem('reg-005', '200', 3)]);
    resolveAutoGift.mockResolvedValue(fakeAutoGiftResult('gift-005'));
    nextGiftThreshold.mockResolvedValue(null);

    const result = await getCart('user5', { includeGiftLogic: true });

    LEGACY_FIELDS.forEach((field) => {
      expect(result).toHaveProperty(field);
    });
  });

  // 6. Empty cart (null) with V2 flag on ────────────────────────────────────────
  it('returns correct shape with promoMessage when cart doc is null and V2 flag is on', async () => {
    mockCartNull();
    nextGiftThreshold.mockResolvedValue({ threshold: 400, gift_name: 'Free Gift' });

    const result = await getCart('user6', { includeGiftLogic: true });

    expect(result.cartCount).toBe(0);
    expect(result.giftAdded).toBe(false);
    expect(result.promoMessage).toMatch(/AED 400/);
    LEGACY_FIELDS.forEach((f) => expect(result).toHaveProperty(f));
  });
});
