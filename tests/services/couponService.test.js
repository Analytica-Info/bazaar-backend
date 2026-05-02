require("../setup");
const mongoose = require("mongoose");
const Coupon = require("../../src/models/Coupon");
const CouponsCount = require("../../src/models/CouponsCount");
const BankPromoCode = require("../../src/models/BankPromoCode");
const BankPromoCodeUsage = require("../../src/models/BankPromoCodeUsage");
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

const clock = require("../../src/utilities/clock");
const couponService = require("../../src/services/couponService");

const FROZEN = new Date('2026-05-01T00:00:00Z');

function freezeClock(date = FROZEN) {
  clock.setClock({
    now:   () => new Date(date),
    nowMs: () => new Date(date).getTime(),
    today: () => new Date(date),
  });
}

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

    it("creates coupon successfully when clock is frozen", async () => {
      freezeClock();
      await CouponsCount.create({ count: 100 });

      const result = await couponService.createCoupon(
        new mongoose.Types.ObjectId(),
        { name: "Jane", phone: "+971509999999" }
      );

      expect(result.success).toBe(true);
      expect(result.coupon.coupon).toMatch(/^DH\d+YHZXB$/);
    });

    afterEach(() => clock.resetClock());
  });

  // ── checkCouponCode — bank promo expiry matrix ─────────────────

  describe("checkCouponCode — bank promo expiry", () => {
    afterEach(() => clock.resetClock());

    describe.each([
      {
        label: "expired yesterday",
        expiryDaysOffset: -1,
        expectedStatus: 400,
        expectedMsg: /expired/i,
      },
    ])(
      "when promo $label",
      ({ expiryDaysOffset, expectedStatus, expectedMsg }) => {
        it(`throws ${expectedStatus}`, async () => {
          freezeClock();

          const expiry = new Date(FROZEN);
          expiry.setDate(expiry.getDate() + expiryDaysOffset);

          await BankPromoCode.create({
            code: "TESTBANK1",
            discountPercent: 15,
            capAED: 100,
            expiryDate: expiry,
            allowedBank: "TestBank",
            active: true,
          });

          try {
            await couponService.checkCouponCode("TESTBANK1", null, null);
            fail("Expected error to be thrown");
          } catch (err) {
            expect(err.status).toBe(expectedStatus);
            expect(err.message).toMatch(expectedMsg);
          }
        });
      }
    );

    it("returns valid promo when expiry is in the future", async () => {
      freezeClock();

      const expiry = new Date(FROZEN);
      expiry.setDate(expiry.getDate() + 1); // expires tomorrow

      await BankPromoCode.create({
        code: "FUTURE10",
        discountPercent: 10,
        capAED: 50,
        expiryDate: expiry,
        allowedBank: "AnyBank",
        active: true,
      });

      const result = await couponService.checkCouponCode("FUTURE10", null, null);

      expect(result.type).toBe("promo");
      expect(result.discountPercent).toBe(10);
    });

    it("throws 400 when singleUsePerCustomer and user already used promo", async () => {
      freezeClock();
      const expiry = new Date(FROZEN);
      expiry.setDate(expiry.getDate() + 1);

      const promo = await BankPromoCode.create({
        code: "SINGLEUSE",
        discountPercent: 5,
        capAED: 30,
        expiryDate: expiry,
        allowedBank: "ADCB",
        active: true,
        singleUsePerCustomer: true,
      });

      const userId = new mongoose.Types.ObjectId();
      await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId });

      try {
        await couponService.checkCouponCode("SINGLEUSE", userId.toString(), null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already used/i);
      }
    });
  });

  // ── checkCouponCode — UAE10 path ──────────────────────────────
  describe("checkCouponCode — UAE10 external promo", () => {
    afterEach(() => clock.resetClock());

    it("throws 404 when fetchCouponDetails returns null (API failure)", async () => {
      const axios = require("axios");
      axios.get.mockRejectedValueOnce(new Error("network error"));

      try {
        await couponService.checkCouponCode("UAE10", null, null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });

    it("throws 400 when UAE10 promo status is not active", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            start_time: "2020-01-01T00:00:00Z",
            end_time: "2030-01-01T00:00:00Z",
            status: "inactive",
          },
        },
      });

      try {
        await couponService.checkCouponCode("UAE10", null, null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/not active/i);
      }
    });

    it("throws 400 when UAE10 promo has not started yet", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            start_time: "2999-01-01T00:00:00Z",
            end_time: "2999-12-31T00:00:00Z",
            status: "active",
          },
        },
      });

      try {
        await couponService.checkCouponCode("UAE10", null, null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/not started/i);
      }
    });

    it("throws 400 when UAE10 promo has expired", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            start_time: "2020-01-01T00:00:00Z",
            end_time: "2020-12-31T00:00:00Z",
            status: "active",
          },
        },
      });

      try {
        await couponService.checkCouponCode("UAE10", null, null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/expired/i);
      }
    });

    it("returns valid when UAE10 is active and within window", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            start_time: "2020-01-01T00:00:00Z",
            end_time: "2999-12-31T00:00:00Z",
            status: "active",
          },
        },
      });

      const result = await couponService.checkCouponCode("UAE10", null, null);
      expect(result.type).toBe("coupon");
      expect(result.discountPercent).toBe(10);
    });
  });

  // ── fetchCouponDetails — null data.data response ─────────────
  describe("checkCouponCode — UAE10 invalid response format", () => {
    it("throws 404 when API returns a response without data.data", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({ data: { someOtherField: "value" } });

      try {
        await couponService.checkCouponCode("UAE10", null, null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  // ── redeemCoupon — missing phone ──────────────────────────────
  describe("redeemCoupon — missing phone (non-UAE10)", () => {
    it("throws 400 when coupon is provided but phone is missing", async () => {
      try {
        await couponService.redeemCoupon(null, "SOMECODE", null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });
  });

  // ── generateCouponCode — with existing DH coupon ──────────────
  describe("createCoupon — next coupon number increments", () => {
    it("generates next sequential coupon when prior DH coupons exist", async () => {
      await Coupon.create({ coupon: "DH5YHZXB", phone: "55555", name: "Prior", id: 5 });
      await CouponsCount.create({ count: 100 });

      const result = await couponService.createCoupon(
        new mongoose.Types.ObjectId(),
        { name: "Sequential", phone: "+971500000099" }
      );

      expect(result.success).toBe(true);
      // DH6YHZXB or higher
      expect(result.coupon.coupon).toMatch(/^DH\d+YHZXB$/);
      const num = parseInt(result.coupon.coupon.match(/DH(\d+)YHZXB/)[1]);
      expect(num).toBeGreaterThanOrEqual(6);
    });
  });

  // ── redeemCoupon — UAE10 path ─────────────────────────────────
  describe("redeemCoupon — UAE10 external promo", () => {
    it("throws 404 when fetchCouponDetails returns null", async () => {
      const axios = require("axios");
      axios.get.mockRejectedValueOnce(new Error("network error"));

      try {
        await couponService.redeemCoupon(null, "UAE10", null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });

    it("throws 400 when UAE10 is not active during redeem", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: { data: { start_time: "2020-01-01T00:00:00Z", end_time: "2030-01-01T00:00:00Z", status: "disabled" } },
      });

      try {
        await couponService.redeemCoupon(null, "UAE10", null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/not active/i);
      }
    });

    it("throws 400 when UAE10 has not started yet during redeem", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: { data: { start_time: "2999-01-01T00:00:00Z", end_time: "2999-12-31T00:00:00Z", status: "active" } },
      });

      try {
        await couponService.redeemCoupon(null, "UAE10", null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/not started/i);
      }
    });

    it("throws 400 when UAE10 has expired during redeem", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: { data: { start_time: "2020-01-01T00:00:00Z", end_time: "2020-12-31T00:00:00Z", status: "active" } },
      });

      try {
        await couponService.redeemCoupon(null, "UAE10", null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/expired/i);
      }
    });

    it("returns valid when UAE10 is active and within window during redeem", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: { data: { start_time: "2020-01-01T00:00:00Z", end_time: "2999-12-31T00:00:00Z", status: "active" } },
      });

      const result = await couponService.redeemCoupon(null, "UAE10", null);
      expect(result.message).toMatch(/valid/i);
    });
  });

  // ── createCoupon — no coupons remaining ───────────────────────
  describe("createCoupon — exhausted coupon pool", () => {
    it("throws 400 when all coupons have been claimed (remaining <= 0)", async () => {
      // Set count to 1, create 1 coupon so remaining = 0
      await CouponsCount.create({ count: 1 });
      await Coupon.create({ coupon: "DH1YHZXB", phone: "11111", name: "Taken", id: 1 });

      try {
        await couponService.createCoupon(new mongoose.Types.ObjectId(), { name: "New", phone: "+971500000001" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/all coupons have been claimed/i);
      }
    });

    it("sends low-stock email alert when remaining coupons <= 10", async () => {
      const { sendEmail } = require("../../src/mail/emailService");
      const { getAdminEmail } = require("../../src/utilities/emailHelper");
      getAdminEmail.mockResolvedValue("admin@test.com");

      // count = 11, 1 existing coupon → remaining = 10 → triggers alert
      await CouponsCount.create({ count: 11 });
      await Coupon.create({ coupon: "DH1YHZXB", phone: "22222", name: "Existing", id: 1 });

      const result = await couponService.createCoupon(
        new mongoose.Types.ObjectId(),
        { name: "Alert Test", phone: "+971500000099" }
      );

      expect(result.success).toBe(true);
      // sendEmail should have been called at least twice (alert + admin notification)
      expect(sendEmail).toHaveBeenCalledWith(
        "admin@test.com",
        expect.stringMatching(/alert/i),
        expect.any(String),
        expect.anything()
      );
    });
  });

  describe("redeemCoupon", () => {
    it("should throw 400 when coupon code is missing", async () => {
      try {
        await couponService.redeemCoupon(null, null, "0501234567");
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });

    it("should return valid when coupon matches phone", async () => {
      await Coupon.create({
        name: "Test User",
        phone: "0501234567",
        coupon: "MYCOUPON",
        status: "unused",
        userId: new mongoose.Types.ObjectId(),
      });

      const result = await couponService.redeemCoupon(null, "MYCOUPON", "0501234567");
      expect(result.message).toMatch(/valid/i);
    });

    it("should throw 404 when coupon/phone mismatch", async () => {
      try {
        await couponService.redeemCoupon(null, "BADCODE", "0509999999");
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });
});
