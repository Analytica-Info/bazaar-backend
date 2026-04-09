require("../setup");
const mongoose = require("mongoose");
const Product = require("../../src/models/Product");
const giftProductService = require("../../src/services/giftProductService");

describe("giftProductService", () => {
  let productA;
  let productB;

  beforeEach(async () => {
    productA = await Product.create({
      product: { id: "ls-100", name: "Product A" },
      variantsData: [
        { id: "v1", sku: "SKU-A1", price: "50.00", qty: 10, name: "Variant 1" },
        { id: "v2", sku: "SKU-A2", price: "60.00", qty: 5, name: "Variant 2" },
      ],
      totalQty: 15,
      status: true,
      isGift: false,
    });

    productB = await Product.create({
      product: { id: "ls-200", name: "Product B" },
      variantsData: [
        { id: "v3", sku: "SKU-B1", price: "30.00", qty: 8, name: "Variant 3" },
      ],
      totalQty: 8,
      status: true,
      isGift: false,
    });
  });

  // ---------------------------------------------------------------------------
  // getGiftProduct
  // ---------------------------------------------------------------------------
  describe("getGiftProduct", () => {
    it("should return null when no gift product is set", async () => {
      const result = await giftProductService.getGiftProduct();
      expect(result).toBeNull();
    });

    it("should return the gift product when one exists", async () => {
      await Product.findByIdAndUpdate(productA._id, { isGift: true });

      const result = await giftProductService.getGiftProduct();

      expect(result).not.toBeNull();
      expect(result._id.toString()).toBe(productA._id.toString());
      expect(result.isGift).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // setGiftProduct
  // ---------------------------------------------------------------------------
  describe("setGiftProduct", () => {
    it("should throw when productId is missing", async () => {
      try {
        await giftProductService.setGiftProduct({});
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/productId is required/i);
      }
    });

    it("should throw when product is not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      try {
        await giftProductService.setGiftProduct({ productId: fakeId });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/product not found/i);
      }
    });

    it("should set product as gift and clear previous gift flags", async () => {
      // First set productA as gift
      await Product.findByIdAndUpdate(productA._id, { isGift: true });

      // Now set productB as gift
      const result = await giftProductService.setGiftProduct({ productId: productB._id });

      expect(result.isGift).toBe(true);
      expect(result._id.toString()).toBe(productB._id.toString());

      // Verify productA is no longer gift
      const updatedA = await Product.findById(productA._id).lean();
      expect(updatedA.isGift).toBe(false);
    });

    it("should validate variant exists when variantId is provided", async () => {
      try {
        await giftProductService.setGiftProduct({
          productId: productA._id,
          variantId: "nonexistent-variant",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/variant not found/i);
      }
    });

    it("should set gift with a valid variantId", async () => {
      const result = await giftProductService.setGiftProduct({
        productId: productA._id,
        variantId: "v1",
      });

      expect(result.isGift).toBe(true);
      expect(result.giftVariantId).toBe("v1");
    });
  });
});
