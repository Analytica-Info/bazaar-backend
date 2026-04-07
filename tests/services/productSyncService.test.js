require("../setup");
const Product = require("../../src/models/Product");

// Mock external dependencies (Lightspeed API, discount sync)
jest.mock("axios");
jest.mock("../../src/helpers/productDiscountSync", () => ({
  applyDiscountFieldsForParentProductId: jest.fn().mockResolvedValue(undefined),
  syncDiscountFieldsForParentIds: jest.fn().mockResolvedValue({
    syncedParentIds: 0,
    skippedParentIds: 0,
    bulkWriteCount: 0,
  }),
}));

const productSyncService = require("../../src/services/productSyncService");

describe("productSyncService", () => {
  // ---------------------------------------------------------------------------
  // getProductsWithWebhookUpdate
  // ---------------------------------------------------------------------------
  describe("getProductsWithWebhookUpdate", () => {
    it("should return products with webhook flag 'product.update'", async () => {
      await Product.create([
        {
          product: { id: "p1", name: "Product 1" },
          variantsData: [],
          totalQty: 5,
          status: true,
          webhook: "product.update",
          webhookTime: "12:00:00 PM",
        },
        {
          product: { id: "p2", name: "Product 2" },
          variantsData: [],
          totalQty: 3,
          status: true,
          webhook: "inventory.update",
          webhookTime: "12:00:00 PM",
        },
      ]);

      const result = await productSyncService.getProductsWithWebhookUpdate();

      expect(result.webhook).toBe("product.update");
      expect(result.count).toBe(1);
      expect(result.products).toHaveLength(1);
      expect(result.products[0].product.id).toBe("p1");
    });

    it("should return empty when no products have product.update webhook", async () => {
      await Product.create({
        product: { id: "p3", name: "Product 3" },
        variantsData: [],
        totalQty: 2,
        status: true,
        webhook: "inventory.update",
      });

      const result = await productSyncService.getProductsWithWebhookUpdate();

      expect(result.count).toBe(0);
      expect(result.products).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // syncWebhookDiscounts
  // ---------------------------------------------------------------------------
  describe("syncWebhookDiscounts", () => {
    it("should run without error on empty DB", async () => {
      const result = await productSyncService.syncWebhookDiscounts();

      expect(result.distinctParentIds).toBe(0);
      expect(result.syncedParentIds).toBe(0);
      expect(result.bulkWriteOperations).toBe(0);
    });

    it("should process products with product.update webhook", async () => {
      await Product.create({
        product: { id: "p10", name: "Sync Product" },
        variantsData: [],
        totalQty: 10,
        status: true,
        webhook: "product.update",
      });

      const result = await productSyncService.syncWebhookDiscounts();

      expect(result.distinctParentIds).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Skipped tests for functions that require Lightspeed API calls
  // ---------------------------------------------------------------------------
  describe("refreshSingleProductById", () => {
    it.skip("requires Lightspeed API - skipped", () => {});
  });

  describe("handleProductUpdate", () => {
    it.skip("requires Lightspeed API - skipped", () => {});
  });

  describe("handleInventoryUpdate", () => {
    it.skip("requires Lightspeed API - skipped", () => {});
  });

  describe("handleSaleUpdate", () => {
    it.skip("requires Lightspeed API - skipped", () => {});
  });
});
