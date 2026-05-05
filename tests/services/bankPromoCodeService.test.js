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
      expect(result.promo.active).toBe(false);
      expect(result.message).toContain("deactivated");

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

    it("should throw 404 when promo not found", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      try {
        await bankPromoCodeService.remove(fakeId);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  // ---- update ----
  describe("update", () => {
    it("should update discount percent and cap", async () => {
      const created = await BankPromoCode.create({
        code: "UPDATE10",
        discountPercent: 10,
        capAED: 50,
        active: true,
        expiryDate: new Date("2027-12-31"),
        allowedBank: "ENBD",
      });

      const result = await bankPromoCodeService.update(created._id.toString(), {
        discountPercent: 20,
        capAED: 100,
      });

      expect(result.discountPercent).toBe(20);
      expect(result.capAED).toBe(100);
    });

    it("should throw 404 when promo not found", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      try {
        await bankPromoCodeService.update(fakeId, { discountPercent: 5 });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });

    it("should throw 400 on duplicate active code when changing code", async () => {
      await BankPromoCode.create({ code: "EXISTING", discountPercent: 5, capAED: 50, active: true, expiryDate: new Date("2027-12-31"), allowedBank: "FAB" });
      const other = await BankPromoCode.create({ code: "OTHER", discountPercent: 10, capAED: 50, active: true, expiryDate: new Date("2027-12-31"), allowedBank: "FAB" });

      try {
        await bankPromoCodeService.update(other._id.toString(), { code: "EXISTING" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already exists/i);
      }
    });

    it("should update all optional fields", async () => {
      const created = await BankPromoCode.create({
        code: "FULL_UPDATE",
        discountPercent: 5,
        capAED: 50,
        active: true,
        expiryDate: new Date("2027-12-31"),
        allowedBank: "DIB",
      });

      const result = await bankPromoCodeService.update(created._id.toString(), {
        allowedBank: "FAB",
        singleUsePerCustomer: true,
        exclusive: true,
        binRanges: ["123456"],
        expiryDate: new Date("2027-01-01"),
      });

      expect(result.allowedBank).toBe("FAB");
      expect(result.singleUsePerCustomer).toBe(true);
      expect(result.exclusive).toBe(true);
    });
  });

  // ---- toggleActive — activate path ----
  describe("toggleActive — activate path", () => {
    it("should activate an inactive promo", async () => {
      const promo = await BankPromoCode.create({
        code: "INACTIVE_PROMO",
        discountPercent: 10,
        capAED: 50,
        active: false,
        expiryDate: new Date("2027-12-31"),
        allowedBank: "ENBD",
      });

      const result = await bankPromoCodeService.toggleActive(promo._id.toString());

      expect(result.promo.active).toBe(true);
    });

    it("should throw 400 when activating a promo with a duplicate active code", async () => {
      const sharedFields = { capAED: 50, expiryDate: new Date("2027-12-31"), allowedBank: "CBD" };
      await BankPromoCode.create({ code: "DUP_TOGGLE", discountPercent: 5, active: true, ...sharedFields });
      const inactive = await BankPromoCode.create({
        code: "DUP_TOGGLE",
        discountPercent: 10,
        active: false,
        ...sharedFields,
      });

      try {
        await bankPromoCodeService.toggleActive(inactive._id.toString());
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/another active/i);
      }
    });

    it("should throw 404 when promo not found", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      try {
        await bankPromoCodeService.toggleActive(fakeId);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  // ---- getById ----
  describe("getById — 404", () => {
    it("should throw 404 when promo not found", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      try {
        await bankPromoCodeService.getById(fakeId);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  // ---- create — duplicate code ----
  describe("create — duplicate code", () => {
    it("should throw 400 on duplicate active code", async () => {
      await BankPromoCode.create({ code: "DUPCODE", discountPercent: 10, capAED: 50, active: true, expiryDate: new Date("2027-12-31"), allowedBank: "RAKBANK" });

      try {
        await bankPromoCodeService.create({ code: "DUPCODE", discountPercent: 5, capAED: 50, expiryDate: new Date("2027-12-31"), allowedBank: "RAKBANK" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already exists/i);
      }
    });
  });
});
