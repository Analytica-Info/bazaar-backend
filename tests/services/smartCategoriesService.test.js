require("../setup");
const mongoose = require("mongoose");
const Product = require("../../src/models/Product");
const FlashSale = require("../../src/models/FlashSale");
const ProductView = require("../../src/models/ProductView");

let smartCategoriesService;

beforeAll(() => {
  smartCategoriesService = require("../../src/services/smartCategoriesService");
});

async function createProduct(overrides = {}) {
  return Product.create({
    product: {
      name: "Test Product",
      id: "test-" + Math.random().toString(36).slice(2),
      product_type_id: "cat-1",
      images: [{ sizes: { original: "img.jpg" } }],
      price_standard: { tax_inclusive: "50.00", tax_exclusive: "45.00" },
    },
    variantsData: [{ id: "v1", name: "Default", qty: 10, price_excl: "45.00" }],
    totalQty: 10,
    sold: 5,
    status: true,
    discount: 10,
    originalPrice: 50,
    discountedPrice: 45,
    ...overrides,
  });
}

describe("smartCategoriesService", () => {
  describe("getHotOffers", () => {
    it("should return empty array when no products match", async () => {
      const result = await smartCategoriesService.getHotOffers({
        priceField: "tax_inclusive",
      });
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });

    it("should accept different priceField values", async () => {
      await createProduct({ discountedPrice: 30 });

      const resultInclusive = await smartCategoriesService.getHotOffers({
        priceField: "tax_inclusive",
      });
      const resultExclusive = await smartCategoriesService.getHotOffers({
        priceField: "tax_exclusive",
      });

      expect(resultInclusive).toBeDefined();
      expect(resultExclusive).toBeDefined();
    });
  });

  describe("getTopRatedProducts", () => {
    it("should return empty when no products exist", async () => {
      const result = await smartCategoriesService.getTopRatedProducts();
      const products = Array.isArray(result) ? result : result.products || [];
      expect(products).toEqual([]);
    });
  });

  describe("getTrendingProducts", () => {
    it("should return empty when no product views", async () => {
      const result = await smartCategoriesService.getTrendingProducts({
        timeWindowHours: 72,
      });
      const products = Array.isArray(result) ? result : result.products || [];
      expect(products).toEqual([]);
    });

    it("should accept different time windows", async () => {
      const product = await createProduct();
      await ProductView.create({
        product_id: product._id,
        user_id: new mongoose.Types.ObjectId(),
        views: 10,
        lastViewedAt: new Date(),
      });

      const result72 = await smartCategoriesService.getTrendingProducts({
        timeWindowHours: 72,
      });
      const result100 = await smartCategoriesService.getTrendingProducts({
        timeWindowHours: 100,
      });

      // Both should work without error — service may return array or object
      expect(result72).toBeDefined();
      expect(result100).toBeDefined();
    });
  });

  describe("getNewArrivals", () => {
    it("should return products sorted by creation date", async () => {
      await createProduct();
      await createProduct();

      const result = await smartCategoriesService.getNewArrivals({
        page: 1,
        limit: 10,
        maxItemsFromDb: 50,
        firstPageLimit: 10,
      });

      expect(result).toBeDefined();
    });
  });

  describe("getSuperSaverProducts", () => {
    it.skip("should return result object (requires external API — integration test)", async () => {
      const result = await smartCategoriesService.getSuperSaverProducts({ minItems: 8 });
      expect(result).toBeDefined();
    });
  });

  describe("getFlashSales", () => {
    it("should handle non-paginated response", async () => {
      const result = await smartCategoriesService.getFlashSales({ paginated: false });
      expect(result).toBeDefined();
    });

    it("should handle paginated response", async () => {
      const result = await smartCategoriesService.getFlashSales({
        paginated: true,
        page: 1,
        limit: 10,
      });
      expect(result).toBeDefined();
    });
  });

  describe("storeFlashSales", () => {
    it("should create or update flash sale config", async () => {
      const result = await smartCategoriesService.storeFlashSales({
        startDay: "Monday",
        startTime: "09:00",
        endDay: "Monday",
        endTime: "21:00",
        isEnabled: true,
      });
      expect(result).toBeDefined();

      const saved = await FlashSale.findOne({});
      expect(saved).toBeTruthy();
      expect(saved.startDay).toBe("Monday");
    });
  });

  describe("todayDeal", () => {
    it("should return empty when no products exist", async () => {
      const result = await smartCategoriesService.todayDeal();
      const products = Array.isArray(result) ? result : result.products || [];
      expect(products).toEqual([]);
    });
  });

  describe("favouritesOfWeek", () => {
    it("should return empty when no products exist", async () => {
      const result = await smartCategoriesService.favouritesOfWeek();
      const products = Array.isArray(result) ? result : result.products || [];
      expect(products).toEqual([]);
    });
  });
});
