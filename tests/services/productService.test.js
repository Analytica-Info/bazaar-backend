require("../setup");
const mongoose = require("mongoose");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const Review = require("../../src/models/Review");
const ProductView = require("../../src/models/ProductView");

// Mock external dependencies
jest.mock("axios");
jest.mock("node-cache", () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
  }));
});
jest.mock("typo-js", () => {
  return jest.fn().mockImplementation(() => ({
    check: jest.fn().mockReturnValue(true),
    suggest: jest.fn().mockReturnValue([]),
  }));
});

const productService = require("../../src/services/productService");

describe("productService", () => {
  // ── Shared test data helpers ──────────────────────────────────

  const makeProduct = (overrides = {}) => ({
    product: {
      id: "prod-001",
      name: "Test Widget",
      description: "A test widget",
      product_type_id: "cat-sub-1",
      images: [{ url: "http://img.test/1.jpg" }],
      ...overrides.product,
    },
    variantsData: overrides.variantsData || [{ sku: "Electronics - SKU1" }],
    totalQty: overrides.totalQty ?? 10,
    status: overrides.status ?? true,
    discount: overrides.discount ?? 20,
    originalPrice: overrides.originalPrice ?? 100,
    discountedPrice: overrides.discountedPrice ?? 80,
    ...overrides,
  });

  const seedProducts = async (count = 3) => {
    const products = [];
    for (let i = 0; i < count; i++) {
      products.push(
        makeProduct({
          product: { id: `prod-${i}`, name: `Widget ${i}`, images: [{ url: `http://img/${i}` }] },
          discountedPrice: 50 + i * 10,
        })
      );
    }
    return Product.insertMany(products);
  };

  const seedCategory = async () => {
    return Category.create({
      side_bar_categories: [
        { id: "cat-1", name: "Electronics" },
        { id: "cat-2", name: "Home" },
      ],
      search_categoriesList: [
        { id: "cat-1", name: "Electronics" },
      ],
    });
  };

  // ── getProducts ───────────────────────────────────────────────

  describe("getProducts", () => {
    it("should return paginated products", async () => {
      await seedProducts(5);

      const result = await productService.getProducts({ page: "1", limit: "2" });

      expect(result.success).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.productsPerPage).toBe(2);
      expect(result.products.length).toBeLessThanOrEqual(2);
      expect(result.pagination.totalProducts).toBe(5);
    });

    it("should return empty products when DB is empty", async () => {
      const result = await productService.getProducts({ page: "1", limit: "10" });

      expect(result.success).toBe(true);
      expect(result.products).toHaveLength(0);
      expect(result.pagination.totalProducts).toBe(0);
    });

    it("should filter by price range", async () => {
      await seedProducts(3); // prices 50, 60, 70

      const result = await productService.getProducts({
        page: "1",
        limit: "10",
        minPrice: "55",
        maxPrice: "65",
      });

      expect(result.success).toBe(true);
      // Only the product with price 60 should match
      expect(result.pagination.totalProducts).toBe(1);
    });
  });

  // ── getProductDetails ─────────────────────────────────────────

  describe("getProductDetails", () => {
    it("should return product details when found", async () => {
      await Product.create(makeProduct({ product: { id: "detail-1", name: "Detail Widget", images: [{ url: "http://img/d" }] } }));

      const result = await productService.getProductDetails("detail-1", null);

      expect(result.product.id).toBe("detail-1");
      expect(result.product.name).toBe("Detail Widget");
      expect(result.reviewsCount).toBe(0);
    });

    it("should include review averages", async () => {
      const prod = await Product.create(
        makeProduct({ product: { id: "rev-prod", name: "Reviewed Widget", images: [{ url: "http://img/r" }] } })
      );
      await Review.create({
        product_id: prod._id,
        quality_rating: 4,
        value_rating: 3,
        price_rating: 5,
      });

      const result = await productService.getProductDetails("rev-prod", null);

      expect(result.reviewsCount).toBe(1);
      expect(Number(result.avgQuality)).toBe(4);
      expect(Number(result.avgValue)).toBe(3);
      expect(Number(result.avgPrice)).toBe(5);
    });

    it("should throw 404 when product not found", async () => {
      try {
        await productService.getProductDetails("nonexistent-id", null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/no product found/i);
      }
    });
  });

  // ── getCategories ─────────────────────────────────────────────

  describe("getCategories", () => {
    it("should return categories when they exist", async () => {
      await seedCategory();

      const result = await productService.getCategories();

      expect(result.success).toBe(true);
      expect(result.side_bar_categories).toHaveLength(2);
      expect(result.search_categoriesList).toHaveLength(1);
    });

    it("should throw 404 when no categories exist", async () => {
      try {
        await productService.getCategories();
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/no categories found/i);
      }
    });
  });

  // ── searchProducts ────────────────────────────────────────────

  describe("searchProducts", () => {
    it("should throw 400 when query is empty", async () => {
      try {
        await productService.searchProducts({ item_name: "" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/at least 3 characters/i);
      }
    });

    it("should throw 400 when query is too short", async () => {
      try {
        await productService.searchProducts({ item_name: "ab" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.data.noResult).toBe(true);
      }
    });
  });

  // ── getAllProducts ─────────────────────────────────────────────

  describe("getAllProducts", () => {
    it("should return all active products", async () => {
      await Product.create(makeProduct({ product: { id: "all-1", name: "Active", images: [{ url: "http://img/1" }] }, status: true }));
      await Product.create(makeProduct({ product: { id: "all-2", name: "Inactive", images: [{ url: "http://img/2" }] }, status: false }));

      const result = await productService.getAllProducts();

      expect(result).toHaveLength(1);
      expect(result[0].product.name).toBe("Active");
    });

    it("should return empty array when no products", async () => {
      const result = await productService.getAllProducts();
      expect(result).toHaveLength(0);
    });
  });

  // ── fetchDbProducts ───────────────────────────────────────────

  describe("fetchDbProducts", () => {
    it("should return paginated admin products", async () => {
      await seedProducts(5);

      const result = await productService.fetchDbProducts({ page: "1", limit: "2" });

      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.totalCount).toBe(5);
      expect(result.products).toHaveLength(2);
    });

    it("should search products by name", async () => {
      await Product.create(makeProduct({ product: { id: "s-1", name: "Blue Sneaker", images: [{ url: "http://img/s" }] } }));
      await Product.create(makeProduct({ product: { id: "s-2", name: "Red Hat", images: [{ url: "http://img/h" }] } }));

      const result = await productService.fetchDbProducts({ page: "1", limit: "10", search: "Sneaker" });

      expect(result.pagination.totalCount).toBe(1);
      expect(result.products[0].product.name).toBe("Blue Sneaker");
    });

    it("should return empty results for no matches", async () => {
      const result = await productService.fetchDbProducts({ page: "1", limit: "10", search: "ZZZZZZZ" });

      expect(result.pagination.totalCount).toBe(0);
      expect(result.products).toHaveLength(0);
    });
  });
});
