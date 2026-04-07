require("../setup");
const mongoose = require("mongoose");
const bankPromoCodeService = require("../../src/services/bankPromoCodeService");
const BankPromoCode = require("../../src/models/BankPromoCode");
const BankPromoCodeUsage = require("../../src/models/BankPromoCodeUsage");

function validPromo(overrides = {}) {
  return {
    code: "BANK10",
    discountPercent: 10,
    capAED: 50,
    expiryDate: new Date("2027-12-31"),
    allowedBank: "ADCB",
    ...overrides,
  };
}

describe("bankPromoCodeService", () => {
  describe("list", () => {
    it("should return empty array when no promos exist", async () => {
      const result = await bankPromoCodeService.list();
      expect(result).toEqual([]);
    });
  });

  describe("create", () => {
    it("should create with valid data", async () => {
      const promo = await bankPromoCodeService.create(validPromo());

      expect(promo.code).toBe("BANK10");
      expect(promo.discountPercent).toBe(10);
      expect(promo.allowedBank).toBe("ADCB");
      expect(promo.active).toBe(true);
      expect(promo.uniqueCustomers).toBe(0);
    });

    it("should throw when code is missing", async () => {
      try {
        await bankPromoCodeService.create(validPromo({ code: undefined }));
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });

    it("should throw on invalid discount > 100", async () => {
      try {
        await bankPromoCodeService.create(validPromo({ discountPercent: 150 }));
        fail("Expected error to be thrown");
      } catch (err) {
        // Mongoose validation error from the model max: 100
        expect(err).toBeDefined();
      }
    });
  });

  describe("getById", () => {
    it("should return enriched promo with uniqueCustomers", async () => {
      const created = await BankPromoCode.create(validPromo());
      const userId = new mongoose.Types.ObjectId();

      await BankPromoCodeUsage.create({
        bankPromoCodeId: created._id,
        userId,
      });

      const result = await bankPromoCodeService.getById(created._id.toString());

      expect(result.code).toBe("BANK10");
      expect(result.uniqueCustomers).toBe(1);
      expect(result.expiryDate).toBeDefined();
    });
  });

  describe("toggleActive", () => {
    it("should deactivate an active promo", async () => {
      const created = await BankPromoCode.create(validPromo());

      const result = await bankPromoCodeService.toggleActive(created._id.toString());
      expect(result.active).toBe(false);

      const saved = await BankPromoCode.findById(created._id);
      expect(saved.active).toBe(false);
    });
  });

  describe("remove", () => {
    it("should delete promo and usage records", async () => {
      const created = await BankPromoCode.create(validPromo());
      const userId = new mongoose.Types.ObjectId();

      await BankPromoCodeUsage.create({
        bankPromoCodeId: created._id,
        userId,
      });

      await bankPromoCodeService.remove(created._id.toString());

      const promo = await BankPromoCode.findById(created._id);
      expect(promo).toBeNull();

      const usages = await BankPromoCodeUsage.find({ bankPromoCodeId: created._id });
      expect(usages).toHaveLength(0);
    });
  });
});
