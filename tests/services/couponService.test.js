require("../setup");
const mongoose = require("mongoose");
const Coupon = require("../../src/models/Coupon");
const CouponsCount = require("../../src/models/CouponsCount");
const User = require("../../src/models/User");

// Mock external dependencies
jest.mock("axios");
jest.mock("../../src/mail/emailService", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/emailHelper", () => ({
  getAdminEmail: jest.fn().mockResolvedValue("admin@test.com"),
  getCcEmails: jest.fn().mockResolvedValue([]),
}));

const couponService = require("../../src/services/couponService");

describe("couponService", () => {
  // ── getCouponCount ────────────────────────────────────────────

  describe("getCouponCount", () => {
    it("should throw 404 when no coupon count exists", async () => {
      try {
        await couponService.getCouponCount();
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });

    it("should return coupon count data when it exists", async () => {
      await CouponsCount.create({ count: 100 });

      const result = await couponService.getCouponCount();

      expect(result.couponCountData).toBeDefined();
      expect(result.couponCountData.count).toBe(100);
    });
  });

  // ── updateCouponCount ─────────────────────────────────────────

  describe("updateCouponCount", () => {
    it("should create and set count when none exists (upsert)", async () => {
      const result = await couponService.updateCouponCount(50);

      expect(result.message).toMatch(/updated successfully/i);
      expect(result.data.count).toBe(50);
    });

    it("should increment existing count", async () => {
      await CouponsCount.create({ count: 100 });

      const result = await couponService.updateCouponCount(25);

      expect(result.data.count).toBe(125);
    });

    it("should throw 400 when count is not a number", async () => {
      try {
        await couponService.updateCouponCount("not-a-number");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/must be a number/i);
      }
    });
  });

  // ── getCoupons ────────────────────────────────────────────────

  describe("getCoupons", () => {
    it("should return count of 0 initially", async () => {
      const result = await couponService.getCoupons();

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it("should return correct count after creating coupons", async () => {
      await Coupon.create({ coupon: "DH1YHZXB", phone: "111", name: "A", id: 1 });
      await Coupon.create({ coupon: "DH2YHZXB", phone: "222", name: "B", id: 2 });

      const result = await couponService.getCoupons();

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  // ── checkCouponCode ───────────────────────────────────────────

  describe("checkCouponCode", () => {
    it("should throw 400 when code is missing", async () => {
      try {
        await couponService.checkCouponCode("", null, null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });

    it("should throw 400 when code is null", async () => {
      try {
        await couponService.checkCouponCode(null, null, null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });

    it("should return valid for an unused coupon in DB", async () => {
      await Coupon.create({ coupon: "DH1YHZXB", phone: "111", name: "A", id: 1, status: "unused" });

      const result = await couponService.checkCouponCode("DH1YHZXB", null, null);

      expect(result.message).toMatch(/valid/i);
      expect(result.type).toBe("coupon");
      expect(result.discountPercent).toBe(10);
    });

    it("should throw 404 for non-existent coupon code", async () => {
      try {
        await couponService.checkCouponCode("INVALID_CODE", null, null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not valid/i);
      }
    });
  });

  // ── createCoupon ──────────────────────────────────────────────

  describe("createCoupon", () => {
    it("should throw 400 when name is missing", async () => {
      try {
        await couponService.createCoupon("user-id", { phone: "123" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });

    it("should throw 400 when phone is missing", async () => {
      try {
        await couponService.createCoupon("user-id", { name: "Test" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });

    it("should throw 400 when phone already exists", async () => {
      await Coupon.create({ coupon: "DH1YHZXB", phone: "111", name: "Existing", id: 1 });

      try {
        await couponService.createCoupon("user-id", { name: "New", phone: "111" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already exists/i);
      }
    });

    it("should create a coupon successfully", async () => {
      await CouponsCount.create({ count: 100 });

      const result = await couponService.createCoupon(
        new mongoose.Types.ObjectId(),
        { name: "John", phone: "+971501234567" }
      );

      expect(result.success).toBe(true);
      expect(result.coupon).toBeDefined();
      expect(result.coupon.coupon).toMatch(/^DH\d+YHZXB$/);
    });
  });
});
