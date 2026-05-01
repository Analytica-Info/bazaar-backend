/**
 * Integration: couponService — usage-limit and single-use-per-customer enforcement
 *
 * Uses real Mongo (MongoMemoryServer).  Covers:
 *  1. A bank promo marked singleUsePerCustomer=true cannot be applied twice
 *     by the same user.
 *  2. A bank promo marked singleUsePerCustomer=false CAN be applied by the
 *     same user more than once (limit is per-code, not per-user).
 *  3. An inactive promo code is treated as non-existent (404).
 *  4. Applying a valid one-use coupon (status=unused) succeeds on first call;
 *     after the coupon is marked 'used', subsequent calls fail with 404.
 */

require("../setup");
const mongoose = require("mongoose");
const couponService = require("../../src/services/couponService");
const BankPromoCode = require("../../src/models/BankPromoCode");
const BankPromoCodeUsage = require("../../src/models/BankPromoCodeUsage");
const Coupon = require("../../src/models/Coupon");

// Stub email so redemption paths don't send real mail
jest.mock("../../src/mail/emailService", () => ({ sendEmail: jest.fn() }));

// Stub external Lightspeed call for UAE10
jest.mock("axios");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const futureDate = () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

async function seedSingleUsePromo(code = "SINGLEUSE01") {
  return BankPromoCode.create({
    code,
    discountPercent: 20,
    capAED: 100,
    expiryDate: futureDate(),
    allowedBank: "TestBank",
    active: true,
    singleUsePerCustomer: true,
  });
}

async function seedMultiUsePromo(code = "MULTIUSE01") {
  return BankPromoCode.create({
    code,
    discountPercent: 5,
    capAED: 25,
    expiryDate: futureDate(),
    allowedBank: "TestBank",
    active: true,
    singleUsePerCustomer: false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("couponService — usage limits", () => {
  let userId;
  let otherUserId;

  beforeEach(() => {
    userId = new mongoose.Types.ObjectId();
    otherUserId = new mongoose.Types.ObjectId();
  });

  // ── single-use-per-customer enforcement ──────────────────────────────────

  it("allows first use of a singleUsePerCustomer promo", async () => {
    await seedSingleUsePromo("FIRSTUSE");

    const result = await couponService.checkCouponCode("FIRSTUSE", userId.toString(), {});
    expect(result.type).toBe("promo");
    expect(result.discountPercent).toBe(20);
  });

  it("blocks second use of a singleUsePerCustomer promo by the same user", async () => {
    const promo = await seedSingleUsePromo("SECONDBLOCK");

    // Record first usage
    await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId });

    await expect(
      couponService.checkCouponCode("SECONDBLOCK", userId.toString(), {})
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("already used"),
    });
  });

  it("allows a different user to use the same singleUsePerCustomer promo", async () => {
    const promo = await seedSingleUsePromo("DIFFUSER");

    // Record usage for userId — otherUserId should still be allowed
    await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId });

    const result = await couponService.checkCouponCode("DIFFUSER", otherUserId.toString(), {});
    expect(result.type).toBe("promo");
  });

  it("allows repeated use of a non-single-use promo by the same user", async () => {
    await seedMultiUsePromo("REPEAT");

    // Two consecutive calls — both should succeed
    const r1 = await couponService.checkCouponCode("REPEAT", userId.toString(), {});
    const r2 = await couponService.checkCouponCode("REPEAT", userId.toString(), {});

    expect(r1.type).toBe("promo");
    expect(r2.type).toBe("promo");
  });

  // ── inactive promo ────────────────────────────────────────────────────────

  it("returns 404 for an inactive promo code", async () => {
    await BankPromoCode.create({
      code: "INACTIVE",
      discountPercent: 10,
      capAED: 30,
      expiryDate: futureDate(),
      allowedBank: "TestBank",
      active: false,
    });

    await expect(
      couponService.checkCouponCode("INACTIVE", userId.toString(), {})
    ).rejects.toMatchObject({ status: 404 });
  });

  // ── one-time coupon (Coupon model) lifecycle ──────────────────────────────

  it("accepts a valid unused coupon code", async () => {
    await Coupon.create({ coupon: "DH1YHZXB", status: "unused", phone: "-" });

    const result = await couponService.checkCouponCode("DH1YHZXB", userId.toString(), {});
    expect(result.type).toBe("coupon");
    expect(result.discountPercent).toBe(10);
  });

  it("returns 404 for a coupon marked as used", async () => {
    await Coupon.create({ coupon: "DH2YHZXB", status: "used", phone: "-" });

    // checkCouponCode only looks for status=unused, so a used coupon falls
    // through to 404 (not valid or already used)
    await expect(
      couponService.checkCouponCode("DH2YHZXB", userId.toString(), {})
    ).rejects.toMatchObject({ status: 404 });
  });
});
