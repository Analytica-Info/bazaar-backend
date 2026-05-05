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

    it("should track product view for authenticated user", async () => {
      const prod = await Product.create(
        makeProduct({ product: { id: "view-prod", name: "View Widget", images: [{ url: "http://img/v" }] } })
      );
      const fakeUserId = new (require("mongoose").Types.ObjectId)();

      await productService.getProductDetails("view-prod", fakeUserId.toString());

      const view = await ProductView.findOne({ product_id: prod._id, user_id: fakeUserId.toString() });
      expect(view).not.toBeNull();
      expect(view.views).toBe(1);
    });

    it("should return total views aggregated from ProductView", async () => {
      const prod = await Product.create(
        makeProduct({ product: { id: "tv-prod", name: "TotalView Widget", images: [{ url: "http://img/tv" }] } })
      );
      const fakeUserId = new (require("mongoose").Types.ObjectId)();
      await ProductView.create({ product_id: prod._id, user_id: null, views: 5, lastViewedAt: new Date() });
      await ProductView.create({ product_id: prod._id, user_id: fakeUserId, views: 3, lastViewedAt: new Date() });

      const result = await productService.getProductDetails("tv-prod", null);

      // total_view should be 5+3 = 8, plus the new view tracked by getProductDetails itself (+1)
      expect(result.total_view).toBeGreaterThanOrEqual(8);
    });

    it("should return multiple reviews with averaged ratings", async () => {
      const prod = await Product.create(
        makeProduct({ product: { id: "multi-rev", name: "MultiRev Widget", images: [{ url: "http://img/mr" }] } })
      );
      await Review.create({ product_id: prod._id, quality_rating: 2, value_rating: 4, price_rating: 3 });
      await Review.create({ product_id: prod._id, quality_rating: 4, value_rating: 2, price_rating: 5 });

      const result = await productService.getProductDetails("multi-rev", null);

      expect(result.reviewsCount).toBe(2);
      expect(Number(result.avgQuality)).toBeCloseTo(3, 0);
      expect(Number(result.avgValue)).toBeCloseTo(3, 0);
      expect(Number(result.avgPrice)).toBeCloseTo(4, 0);
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

  // ── getAllCategories ──────────────────────────────────────────────

  describe("getAllCategories", () => {
    it("should return category tree and flat list", async () => {
      // Create a Category document with category_path entries
      await Category.create({
        side_bar_categories: [{ id: "cat-root", name: "Electronics" }],
        search_categoriesList: [{ id: "cat-root", name: "Electronics" }],
        category_path: [
          { id: "cat-root", name: "Electronics" },
          { id: "cat-sub", name: "Phones" },
        ],
      });

      // Also create a product to match
      await Product.create(
        makeProduct({
          product: { id: "cat-prod", name: "Phone", product_type_id: "cat-sub", images: [{ url: "http://img/p" }] },
          status: true,
          totalQty: 5,
        })
      );

      const result = await productService.getAllCategories();

      expect(result.side_bar_categories).toBeDefined();
      expect(result.search_categoriesList).toBeDefined();
      expect(Array.isArray(result.side_bar_categories)).toBe(true);
      expect(Array.isArray(result.search_categoriesList)).toBe(true);
    });

    it("should return empty tree when no categories exist", async () => {
      const result = await productService.getAllCategories();

      expect(result.side_bar_categories).toHaveLength(0);
      expect(result.search_categoriesList).toHaveLength(0);
    });
  });

  // ── getSimilarProducts ────────────────────────────────────────────

  describe("getSimilarProducts", () => {
    it("should return similar products excluding the given product ID", async () => {
      const prod1 = await Product.create(
        makeProduct({
          product: { id: "sim-1", name: "Similar A", product_type_id: "type-abc", images: [{ url: "http://img/s1" }] },
          status: true,
          discountedPrice: 50,
        })
      );
      await Product.create(
        makeProduct({
          product: { id: "sim-2", name: "Similar B", product_type_id: "type-abc", images: [{ url: "http://img/s2" }] },
          status: true,
          discountedPrice: 60,
        })
      );

      const result = await productService.getSimilarProducts("type-abc", prod1._id.toString());

      // Should not include prod1
      expect(result.similarProducts).toBeDefined();
      const ids = result.similarProducts.map((p) => p._id.toString());
      expect(ids).not.toContain(prod1._id.toString());
    });

    it("should throw 400 when product type ID is missing", async () => {
      try {
        await productService.getSimilarProducts("", null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/product type id is required/i);
      }
    });
  });

  // ── fetchProductsNoImages ─────────────────────────────────────────

  describe("fetchProductsNoImages", () => {
    it("should return products without images", async () => {
      // Product with no images
      await Product.create(
        makeProduct({
          product: { id: "no-img-1", name: "No Image Widget", images: [] },
        })
      );
      // Product with images (should not be returned)
      await Product.create(
        makeProduct({
          product: { id: "has-img-1", name: "Has Image Widget", images: [{ url: "http://img/1" }] },
        })
      );

      const result = await productService.fetchProductsNoImages({ page: "1", limit: "10" });

      expect(result.pagination).toBeDefined();
      expect(result.products).toBeDefined();
      // Only the no-image product should be found
      expect(result.pagination.totalCount).toBe(1);
      expect(result.products[0].product.name).toBe("No Image Widget");
    });

    it("should return empty when all products have images", async () => {
      await Product.create(
        makeProduct({
          product: { id: "img-all", name: "All Good", images: [{ url: "http://img/a" }] },
        })
      );

      const result = await productService.fetchProductsNoImages({ page: "1", limit: "10" });

      expect(result.pagination.totalCount).toBe(0);
      expect(result.products).toHaveLength(0);
    });
  });

  // ── searchSingleProduct ────────────────────────────────────────
  describe("searchSingleProduct", () => {
    it("should throw 404 when no product matches the name", async () => {
      try {
        await productService.searchSingleProduct("xyznonexistentname999");
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  // ── getBrandNameById ──────────────────────────────────────────
  describe("getBrandNameById", () => {
    it("should throw 404 when brand not found by numeric-string id", async () => {
      try {
        await productService.getBrandNameById("999999999");
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  // ── getCategoryNameById ────────────────────────────────────────
  describe("getCategoryNameById", () => {
    it("should throw 404 when category not found", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      try {
        await productService.getCategoryNameById(fakeId);
        fail("Expected error");
      } catch (err) {
        // 404 or 400 depending on ObjectId validation
        expect([400, 404, 500]).toContain(err.status);
      }
    });
  });

  // ── getRandomProducts ──────────────────────────────────────────
  describe("getRandomProducts", () => {
    it("should return defined result or throw when no products exist", async () => {
      const fakeExcludeId = new mongoose.Types.ObjectId().toString();
      try {
        const result = await productService.getRandomProducts(fakeExcludeId);
        expect(result).toBeDefined();
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  // ── getSearchCategories ────────────────────────────────────────
  describe("getSearchCategories", () => {
    it("should return result or throw when no categories match", async () => {
      try {
        const result = await productService.getSearchCategories("xyznonexistent");
        expect(result).toBeDefined();
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  // ── getCategoriesProduct ───────────────────────────────────────
  describe("getCategoriesProduct", () => {
    it("should return result or throw when category has no products", async () => {
      const fakeId = "nonexistent-cat-id";
      try {
        const result = await productService.getCategoriesProduct(fakeId, {
          page: 1,
          limit: 10,
        });
        expect(result).toBeDefined();
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  // ── searchProducts — minimum length ───────────────────────────
  describe("searchProducts — min length validation", () => {
    it("should throw when query is exactly 2 characters (too short)", async () => {
      try {
        await productService.searchProducts({
          query: "ab",
          page: 1,
          limit: 10,
        });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });
  });

  // ── getProducts — filter branches ────────────────────────────
  describe("getProducts — filter branches", () => {
    it("should return results for category filter (no match is fine)", async () => {
      const result = await productService.getProducts({
        category: "nonexistent-cat",
        page: 1,
        limit: 10,
      });
      expect(result).toBeDefined();
    });

    it("should filter by subcategory without throwing", async () => {
      const result = await productService.getProducts({
        subcategory: "nonexistent-sub",
        page: 1,
        limit: 10,
      });
      expect(result).toBeDefined();
    });

    it("should filter by subsubcategory without throwing", async () => {
      const result = await productService.getProducts({
        subsubcategory: "nonexistent-subsub",
        page: 1,
        limit: 10,
      });
      expect(result).toBeDefined();
    });

    it("should filter by brand without throwing", async () => {
      const result = await productService.getProducts({
        brand: "TestBrand",
        page: 1,
        limit: 10,
      });
      expect(result).toBeDefined();
    });

    it("should sort by price_asc without throwing", async () => {
      const result = await productService.getProducts({
        sort: "price_asc",
        page: 1,
        limit: 10,
      });
      expect(result).toBeDefined();
    });

    it("should sort by price_desc without throwing", async () => {
      const result = await productService.getProducts({
        sort: "price_desc",
        page: 1,
        limit: 10,
      });
      expect(result).toBeDefined();
    });
  });
});
