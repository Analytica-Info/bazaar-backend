require("../setup");
const mongoose = require("mongoose");
const ProductRepository = require("../../src/repositories/ProductRepository");

let pCounter = 0;
function makeProduct(overrides = {}) {
  pCounter += 1;
  return {
    product: {
      id: `PROD-${Date.now()}-${pCounter}`,
      name: `Product ${pCounter}`,
      sku_number: `SKU-${pCounter}`,
      product_type_id: "type-001",
    },
    variantsData: [{ id: `var-${pCounter}`, sku: `VAR-SKU-${pCounter}` }],
    totalQty: 10,
    status: true,
    ...overrides,
  };
}

describe("ProductRepository", () => {
  let repo;

  beforeEach(() => {
    repo = new ProductRepository();
  });

  // ─── findByIdsLean ──────────────────────────────────────────────────────────

  describe("findByIdsLean", () => {
    it("returns empty array for empty ids list", async () => {
      const result = await repo.findByIdsLean([]);
      expect(result).toEqual([]);
    });

    it("returns empty array for null input", async () => {
      const result = await repo.findByIdsLean(null);
      expect(result).toEqual([]);
    });

    it("finds products by ids", async () => {
      const p = await repo.create(makeProduct());
      const result = await repo.findByIdsLean([p._id]);
      expect(result).toHaveLength(1);
      expect(String(result[0]._id)).toBe(String(p._id));
    });

    it("returns only matching ids", async () => {
      const p1 = await repo.create(makeProduct());
      await repo.create(makeProduct()); // p2 not requested
      const result = await repo.findByIdsLean([p1._id]);
      expect(result).toHaveLength(1);
    });

    it("applies projection when provided", async () => {
      const p = await repo.create(makeProduct());
      const result = await repo.findByIdsLean([p._id], "status totalQty");
      expect(result[0].status).toBeDefined();
      // product field excluded by projection
      expect(result[0].product).toBeUndefined();
    });
  });

  // ─── findSkuMap ──────────────────────────────────────────────────────────────

  describe("findSkuMap", () => {
    it("returns empty map for empty ids", async () => {
      const map = await repo.findSkuMap([]);
      expect(map).toEqual({});
    });

    it("returns sku_number keyed by product id", async () => {
      const p = await repo.create(makeProduct());
      const map = await repo.findSkuMap([p._id]);
      expect(map[String(p._id)]).toBe(p.product.sku_number);
    });

    it("returns null sku for products without sku_number", async () => {
      const pData = makeProduct();
      delete pData.product.sku_number;
      const p = await repo.create(pData);
      const map = await repo.findSkuMap([p._id]);
      expect(map[String(p._id)]).toBeNull();
    });

    it("handles non-existent ids gracefully", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const map = await repo.findSkuMap([fakeId]);
      expect(map).toEqual({});
    });
  });

  // ─── findByIds ───────────────────────────────────────────────────────────────

  describe("findByIds", () => {
    it("returns empty array for empty ids", async () => {
      const result = await repo.findByIds([]);
      expect(result).toEqual([]);
    });

    it("returns hydrated documents", async () => {
      const p = await repo.create(makeProduct());
      const result = await repo.findByIds([p._id]);
      expect(result).toHaveLength(1);
      expect(typeof result[0].save).toBe("function");
    });
  });

  // ─── findByIdsForReviews ──────────────────────────────────────────────────────

  describe("findByIdsForReviews", () => {
    it("returns empty array for empty ids", async () => {
      const result = await repo.findByIdsForReviews([]);
      expect(result).toEqual([]);
    });

    it("returns lean docs for review display", async () => {
      const p = await repo.create(makeProduct());
      const result = await repo.findByIdsForReviews([p._id]);
      expect(result).toHaveLength(1);
      expect(typeof result[0].save).toBe("undefined");
    });
  });
});
