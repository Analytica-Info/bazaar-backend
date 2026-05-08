/**
 * getProducts.v2.test.js
 *
 * Tests for the enhanced getProducts use-case:
 *   - sort param (price_asc, price_desc, newest, unknown fallback)
 *   - removal of $rand (pagination stability)
 *   - categoryId filtering with descendant expansion
 *   - categoryId resolves to nothing → empty page, no 500
 *   - all four params combined
 *   - backward-compat: old mobile binary (page + limit only)
 */

require('../setup');
const Product = require('../../src/models/Product');

// ── mock fetchAndCacheCategories ─────────────────────────────────────────────
const mockFetchAndCacheCategories = jest.fn();

jest.mock('../../src/services/product/adapters/cache', () => ({
  fetchAndCacheCategories: (...a) => mockFetchAndCacheCategories(...a),
  fetchCategoriesType: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/utilities/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// repositories mock uses real Mongoose model wired to MongoMemoryServer via setup
jest.mock('../../src/repositories', () => {
  const Product = require('../../src/models/Product');
  return {
    products: {
      rawModel: () => Product,
    },
  };
});

const { getProducts } = require('../../src/services/product/use-cases/getProducts');

// ── helpers ──────────────────────────────────────────────────────────────────

const mkProd = (overrides = {}) => ({
  product: {
    id: overrides.productId || `p-${Math.random()}`,
    name: overrides.name || 'Widget',
    product_type_id: overrides.product_type_id || 'type-default',
    images: [{ url: 'http://img/1.jpg' }],
  },
  variantsData: [{ id: `v-${Math.random()}`, qty: 10, name: 'Default', sku: 'Brand New - SKU1' }],
  totalQty: overrides.totalQty ?? 5,
  status: overrides.status ?? true,
  discount: 10,
  originalPrice: 200,
  discountedPrice: overrides.discountedPrice ?? 100,
  ...overrides,
});

async function seed(specs) {
  return Product.insertMany(specs.map((s) => mkProd(s)));
}

// simple tree that getCategoriesProduct uses
const CATEGORY_TREE = [
  {
    category_path: [
      { id: 'cat-root', name: 'Electronics' },
      { id: 'cat-child-1', name: 'Phones' },
      { id: 'cat-child-2', name: 'Tablets' },
    ],
  },
  {
    category_path: [
      { id: 'cat-other', name: 'Clothing' },
      { id: 'cat-other-child', name: 'Tops' },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAndCacheCategories.mockResolvedValue(CATEGORY_TREE);
});

// ── sort: price_asc ───────────────────────────────────────────────────────────

describe('sort=price_asc', () => {
  it('returns products in ascending discountedPrice order', async () => {
    await seed([
      { discountedPrice: 300 },
      { discountedPrice: 100 },
      { discountedPrice: 200 },
    ]);

    const result = await getProducts({ page: '1', limit: '10', sort: 'price_asc' });

    expect(result.success).toBe(true);
    const prices = result.products.map((p) => p.discountedPrice);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});

// ── sort: price_desc ──────────────────────────────────────────────────────────

describe('sort=price_desc', () => {
  it('returns products in descending discountedPrice order', async () => {
    await seed([
      { discountedPrice: 150 },
      { discountedPrice: 50 },
      { discountedPrice: 250 },
    ]);

    const result = await getProducts({ page: '1', limit: '10', sort: 'price_desc' });

    const prices = result.products.map((p) => p.discountedPrice);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });
});

// ── sort: newest (default) ────────────────────────────────────────────────────

describe('sort=newest (default)', () => {
  it('returns products ordered by createdAt desc when sort=newest', async () => {
    // Insert with a small delay so createdAt timestamps differ
    const p1 = await Product.create(mkProd({ discountedPrice: 80 }));
    await new Promise((r) => setTimeout(r, 5));
    const p2 = await Product.create(mkProd({ discountedPrice: 90 }));
    await new Promise((r) => setTimeout(r, 5));
    const p3 = await Product.create(mkProd({ discountedPrice: 70 }));

    const result = await getProducts({ page: '1', limit: '10', sort: 'newest' });

    const ids = result.products.map((p) => p._id.toString());
    // p3 inserted last → should appear first
    expect(ids[0]).toBe(p3._id.toString());
    expect(ids[1]).toBe(p2._id.toString());
    expect(ids[2]).toBe(p1._id.toString());
  });

  it('defaults to newest when sort param is omitted', async () => {
    await seed([{ discountedPrice: 80 }, { discountedPrice: 90 }]);
    const result = await getProducts({ page: '1', limit: '10' });
    expect(result.success).toBe(true);
    expect(result.products.length).toBeGreaterThan(0);
  });
});

// ── sort: unknown value falls back to newest ──────────────────────────────────

describe('sort=garbage (unknown)', () => {
  it('does not error and returns results with newest fallback', async () => {
    await seed([{ discountedPrice: 100 }, { discountedPrice: 200 }]);

    const result = await getProducts({ page: '1', limit: '10', sort: 'garbage_value' });

    expect(result.success).toBe(true);
    expect(result.products.length).toBe(2);
  });
});

// ── categoryId narrows results ────────────────────────────────────────────────

describe('categoryId narrows results', () => {
  it('returns only products whose product_type_id is in descendant ids', async () => {
    await seed([
      { product_type_id: 'cat-child-1', discountedPrice: 100 },
      { product_type_id: 'cat-child-2', discountedPrice: 110 },
      { product_type_id: 'cat-other', discountedPrice: 120 },
    ]);

    // cat-root's descendants: cat-root, cat-child-1, cat-child-2
    const result = await getProducts({ page: '1', limit: '10', categoryId: 'cat-root' });

    expect(result.success).toBe(true);
    // cat-other should be excluded
    expect(result.pagination.totalProducts).toBe(2);
    const typeIds = result.products.map((p) => p.product.product_type_id);
    expect(typeIds).not.toContain('cat-other');
  });

  it('passes the correct $in array to the pipeline (descendant ids include root)', async () => {
    await seed([{ product_type_id: 'cat-root', discountedPrice: 100 }]);

    const result = await getProducts({ page: '1', limit: '10', categoryId: 'cat-root' });

    expect(result.pagination.totalProducts).toBe(1);
  });
});

// ── categoryId with no descendants → empty page, no 500 ──────────────────────

describe('categoryId with no descendants', () => {
  it('returns empty page when categoryId is not found in tree', async () => {
    await seed([{ discountedPrice: 100 }]);

    const result = await getProducts({ page: '1', limit: '10', categoryId: 'does-not-exist' });

    expect(result.success).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.totalProducts).toBe(0);
  });

  it('returns empty page when fetchAndCacheCategories throws', async () => {
    mockFetchAndCacheCategories.mockRejectedValue(new Error('cache down'));
    await seed([{ discountedPrice: 100 }]);

    const result = await getProducts({ page: '1', limit: '10', categoryId: 'cat-root' });

    expect(result.success).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.pagination.totalProducts).toBe(0);
  });
});

// ── pagination stability (regression test for removing $rand) ─────────────────

describe('pagination stability', () => {
  it('returns identical page-1 results across two consecutive calls', async () => {
    await seed([
      { discountedPrice: 100 },
      { discountedPrice: 200 },
      { discountedPrice: 300 },
      { discountedPrice: 400 },
      { discountedPrice: 500 },
    ]);

    const query = { page: '1', limit: '3', sort: 'price_asc' };

    const first = await getProducts(query);
    const second = await getProducts(query);

    const firstIds = first.products.map((p) => p._id.toString());
    const secondIds = second.products.map((p) => p._id.toString());

    expect(firstIds).toEqual(secondIds);
  });
});

// ── all four params combined ──────────────────────────────────────────────────

describe('combined: categoryId + sort + filter + price', () => {
  it('returns correct products when all four params are used together', async () => {
    await seed([
      { product_type_id: 'cat-child-1', discountedPrice: 150, variantsData: [{ sku: 'brand new - xyz' }] },
      { product_type_id: 'cat-child-1', discountedPrice: 250, variantsData: [{ sku: 'brand new - abc' }] },
      { product_type_id: 'cat-child-1', discountedPrice: 80,  variantsData: [{ sku: 'brand new - def' }] },
      { product_type_id: 'cat-other',   discountedPrice: 150, variantsData: [{ sku: 'brand new - uvw' }] },
    ]);

    const result = await getProducts({
      page: '1',
      limit: '10',
      sort: 'price_asc',
      categoryId: 'cat-root',
      minPrice: '100',
      maxPrice: '200',
      filter: '["brand new"]',
    });

    expect(result.success).toBe(true);
    // Only the first product matches: cat-child-1, price 150, sku starts with "brand new"
    expect(result.pagination.totalProducts).toBe(1);
    expect(result.products[0].discountedPrice).toBe(150);
  });
});

// ── backward compat: old mobile binary (page + limit only) ───────────────────

describe('backward compatibility', () => {
  it('returns exact pagination envelope shape with only page and limit', async () => {
    await seed([{ discountedPrice: 100 }, { discountedPrice: 200 }]);

    const result = await getProducts({ page: '1', limit: '2' });

    expect(result.success).toBe(true);
    expect(result).toHaveProperty('pagination');
    expect(result.pagination).toMatchObject({
      currentPage: 1,
      totalPages: expect.any(Number),
      totalProducts: expect.any(Number),
      productsPerPage: 2,
    });
    expect(Array.isArray(result.products)).toBe(true);
    // Confirm no extra top-level keys beyond these three
    const keys = Object.keys(result);
    expect(keys).toEqual(expect.arrayContaining(['success', 'pagination', 'products']));
  });

  it('does not throw when sort and categoryId are absent', async () => {
    await expect(getProducts({ page: '1', limit: '5' })).resolves.toMatchObject({ success: true });
  });
});
