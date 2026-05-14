/**
 * Integration: couponService.checkCouponCode — expired bank promo code path
 *
 * Uses real Mongo (MongoMemoryServer) with the BankPromoCode model.
 * Confirms:
 *  1. An expired bank promo code throws status 400 with the right message.
 *  2. Cart state is unchanged after a failed coupon application (cart is
 *     read-only in checkCouponCode — service does not mutate it, so cart
 *     contents remain exactly as seeded).
 *  3. A valid (non-expired) promo code succeeds.
 *  4. An unknown code returns 404.
 */

require("../setup");
const mongoose = require("mongoose");
const couponService = require("../../src/services/couponService");
const CartRepository = require("../../src/repositories/CartRepository");
const BankPromoCode = require("../../src/models/BankPromoCode");
const BankPromoCodeUsage = require("../../src/models/BankPromoCodeUsage");

// Stub the external Lightspeed axios call so UAE10 tests don't hit the network
jest.mock("axios");
const axios = require("axios");

// Stub email so coupon redemption paths don't try to send mail
jest.mock("../../src/mail/emailService", () => ({ sendEmail: jest.fn() }));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCartItem(overrides = {}) {
  return {
    product: new mongoose.Types.ObjectId(),
    quantity: 1,
    image: "https://example.com/img.jpg",
    name: "Test Product",
    originalPrice: "100",
    productId: "prod-001",
    totalAvailableQty: "10",
    variantId: `var-${Math.random().toString(36).slice(2)}`,
    variantName: "Default",
    variantPrice: "100",
    ...overrides,
  };
}

async function seedExpiredPromo() {
  return BankPromoCode.create({
    code: "EXPIREDTEST",
    discountPercent: 15,
    capAED: 50,
    expiryDate: new Date(Date.now() - 1000 * 60 * 60 * 24), // yesterday
    allowedBank: "TestBank",
    active: true,
  });
}

async function seedValidPromo() {
  return BankPromoCode.create({
    code: "VALIDTEST",
    discountPercent: 10,
    capAED: 30,
    expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days ahead
    allowedBank: "TestBank",
    active: true,
    singleUsePerCustomer: false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("couponService.checkCouponCode — expired / invalid promo codes", () => {
  let cartRepo;
  let userId;

  beforeEach(async () => {
    cartRepo = new CartRepository();
    userId = new mongoose.Types.ObjectId();
  });

  it("throws status 400 for an expired bank promo code", async () => {
    await seedExpiredPromo();

    await expect(
      couponService.checkCouponCode("EXPIREDTEST", userId.toString(), {})
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("expired"),
    });
  });

  it("leaves cart state unchanged after an expired coupon attempt", async () => {
    const item = makeCartItem();
    await cartRepo.model.create({ user: userId, items: [item] });
    await seedExpiredPromo();

    // This should throw — cart must not change
    await expect(
      couponService.checkCouponCode("EXPIREDTEST", userId.toString(), {})
    ).rejects.toMatchObject({ status: 400 });

    const cart = await cartRepo.model.findOne({ user: userId }).lean();
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].name).toBe("Test Product");
  });

  it("succeeds for a valid (non-expired) bank promo code", async () => {
    await seedValidPromo();

    const result = await couponService.checkCouponCode("VALIDTEST", userId.toString(), {});
    expect(result.type).toBe("promo");
    expect(result.discountPercent).toBe(10);
  });

  it("throws status 404 for an unrecognised code", async () => {
    await expect(
      couponService.checkCouponCode("DOESNOTEXIST", userId.toString(), {})
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws status 400 for an empty coupon code", async () => {
    await expect(
      couponService.checkCouponCode("", userId.toString(), {})
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("required"),
    });
  });

  it("throws 400 for singleUsePerCustomer promo already used by the same user", async () => {
    const promo = await BankPromoCode.create({
      code: "ONCEPERUSER",
      discountPercent: 5,
      capAED: 20,
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      allowedBank: "TestBank",
      active: true,
      singleUsePerCustomer: true,
    });

    // Record prior usage
    await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId });

    await expect(
      couponService.checkCouponCode("ONCEPERUSER", userId.toString(), {})
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("already used"),
    });
  });
});
