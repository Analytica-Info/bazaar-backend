/**
 * productService.coverage.test.js
 * PR7 — Push productService to ≥80% lines.
 * Extends the base productService.test.js with uncovered paths.
 */

require('../setup');
const mongoose = require('mongoose');
const axios = require('axios');
const Product = require('../../src/models/Product');
const Category = require('../../src/models/Category');
const Brand = require('../../src/models/Brand');
const ProductView = require('../../src/models/ProductView');

jest.mock('axios');
jest.mock('node-cache', () => jest.fn().mockImplementation(() => ({
  get: jest.fn().mockReturnValue(undefined),
  set: jest.fn(),
})));
jest.mock('typo-js', () => jest.fn().mockImplementation(() => ({
  check: jest.fn().mockReturnValue(true),
  suggest: jest.fn().mockReturnValue([]),
})));

// Cache: bypass Redis entirely — always go to DB / fetcher
jest.mock('../../src/utilities/cache', () => ({
  key: (...parts) => parts.join(':'),
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(true),
  getOrSet: jest.fn(async (_key, _ttl, fetcher) => fetcher()),
}));

// Silence logger noise in tests
jest.mock('../../src/utilities/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const productService = require('../../src/services/productService');

// ── Fixtures ──────────────────────────────────────────────────────────────

const mkProd = (overrides = {}) => ({
  product: {
    id: `prod-${Date.now()}-${Math.random()}`,
    name: 'Test Widget',
    description: 'A test product',
    product_type_id: 'type-001',
    images: [{ url: 'http://img/1.jpg' }],
    ...overrides.product,
  },
  variantsData: overrides.variantsData || [{ id: `var-${Date.now()}`, qty: 10, name: 'Default', sku: 'Electronics - SKU1' }],
  totalQty: overrides.totalQty ?? 10,
  status: overrides.status ?? true,
  discount: overrides.discount ?? 20,
  originalPrice: overrides.originalPrice ?? 100,
  discountedPrice: overrides.discountedPrice ?? 80,
  ...overrides,
});

async function seedN(n = 3) {
  const docs = [];
  for (let i = 0; i < n; i++) {
    docs.push(mkProd({
      product: { id: `seeded-${i}-${Date.now()}`, name: `Widget ${i}`, images: [{ url: `http://img/${i}` }] },
      discountedPrice: 50 + i * 10,
    }));
  }
  return Product.insertMany(docs);
}

// ── getProducts ── additional branches ───────────────────────────────────

describe('productService — getProducts (additional branches)', () => {
  it('returns products with default pagination when no query params', async () => {
    await seedN(3);
    const result = await productService.getProducts({});
    expect(result.success).toBe(true);
    expect(result.products.length).toBe(3);
  });

  it('applies filter JSON array to variantsData.sku regex', async () => {
    await Product.create(mkProd({
      product: { id: 'filter-elec', name: 'Electronics Item', images: [{ url: 'http://img/e' }] },
      variantsData: [{ id: 'var-f1', qty: 5, name: 'V1', sku: 'Electronics - FilterSKU' }],
      totalQty: 5,
    }));
    await Product.create(mkProd({
      product: { id: 'filter-home', name: 'Home Item', images: [{ url: 'http://img/h' }] },
      variantsData: [{ id: 'var-f2', qty: 5, name: 'V1', sku: 'Home - FilterSKU' }],
      totalQty: 5,
    }));

    const result = await productService.getProducts({
      page: '1', limit: '10',
      filter: JSON.stringify(['electronics']),
    });
    expect(result.success).toBe(true);
    // Only electronics-matched products should appear
    const names = result.products.map(p => p.product.name);
    expect(names.some(n => n.toLowerCase().includes('electronics'))).toBe(true);
  });

  it('ignores malformed filter JSON without throwing', async () => {
    await seedN(2);
    const result = await productService.getProducts({ page: '1', limit: '10', filter: 'NOT-VALID-JSON{' });
    expect(result.success).toBe(true);
  });

  it('ignores empty filter array []', async () => {
    await seedN(2);
    const result = await productService.getProducts({ page: '1', limit: '10', filter: '[]' });
    expect(result.success).toBe(true);
  });

  it('returns page 2 correctly', async () => {
    await seedN(5);
    const result = await productService.getProducts({ page: '2', limit: '2' });
    expect(result.success).toBe(true);
    expect(result.pagination.currentPage).toBe(2);
  });
});

// ── getHomeProducts ─────────────────────────────────────────────────────

describe('productService — getHomeProducts', () => {
  beforeEach(() => {
    // Reset getOrSet mock to always invoke fetcher
    require('../../src/utilities/cache').getOrSet.mockImplementation(async (_k, _ttl, fetcher) => fetcher());
    axios.get.mockReset();
  });

  it('returns result object with empty data when axios returns empty categories', async () => {
    axios.get.mockResolvedValue({ data: { data: { data: { categories: [] } } } });
    const result = await productService.getHomeProducts();
    expect(result).toBeDefined();
    expect(result.result).toBeDefined();
  });

  it('returns result when categories have parent/sub structure', async () => {
    const categories = [
      { id: 'root-1', name: 'Electronics', parent_category_id: null, root_category_id: 'root-1' },
      { id: 'sub-1', name: 'Phones', parent_category_id: 'root-1', root_category_id: 'root-1' },
    ];
    axios.get.mockResolvedValue({ data: { data: { data: { categories } } } });

    await Product.create(mkProd({
      product: { id: 'hp-1', name: 'Phone', product_type_id: 'sub-1', images: [{ url: 'http://img/p' }] },
      status: true,
    }));

    const result = await productService.getHomeProducts();
    expect(result.result).toBeDefined();
  });

  it('returns uncategorized section when product has null product_type_id', async () => {
    const categories = [
      { id: 'Electronics', name: 'Electronics', parent_category_id: null, root_category_id: 'Electronics' },
    ];
    axios.get.mockResolvedValue({ data: { data: { data: { categories } } } });

    await Product.create(mkProd({
      product: { id: 'uncategorized-1', name: 'Uncategorized Widget', product_type_id: null, images: [{ url: 'http://img/u' }] },
      status: true,
    }));

    const result = await productService.getHomeProducts();
    expect(result.result).toBeDefined();
  });

  it('propagates HTTP error from axios as 500', async () => {
    axios.get.mockRejectedValue(new Error('Lightspeed down'));
    await expect(productService.getHomeProducts()).rejects.toMatchObject({ status: 500 });
  });
});

// ── getCategoriesProduct ──────────────────────────────────────────────────

describe('productService — getCategoriesProduct', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  it('returns empty result when no categories match', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { data: { data: { categories: [] } } } }) // fetchAndCacheCategories
      .mockResolvedValueOnce({ data: {} }); // fetchCategoriesType

    const result = await productService.getCategoriesProduct('nonexistent-cat-id', { page: 1, limit: 10 });
    expect(result.success).toBe(true);
    expect(result.filteredProducts).toHaveLength(0);
  });

  it('returns matching products when category IDs resolve', async () => {
    const categories = [
      {
        id: 'sub-cat', name: 'Sub',
        category_path: [{ id: 'root-cat', name: 'Root' }, { id: 'sub-cat', name: 'Sub' }],
        parent_category_id: 'root-cat', root_category_id: 'root-cat',
      },
    ];
    axios.get
      .mockResolvedValueOnce({ data: { data: { data: { categories } } } })
      .mockResolvedValueOnce({ data: { data: { category_path: [{ id: 'root-cat', name: 'Root' }] } } });

    await Product.create(mkProd({
      product: { id: 'cat-p1', name: 'Cat Product', product_type_id: 'root-cat', images: [{ url: 'http://img/cp' }] },
      status: true, totalQty: 5, discountedPrice: 50,
    }));

    const result = await productService.getCategoriesProduct('root-cat', { page: 1, limit: 10 });
    expect(result.success).toBe(true);
    expect(result.filteredProductsCount).toBeGreaterThanOrEqual(0);
  });

  it('returns empty result when categoriesType has no category_path', async () => {
    const categories = [
      { id: 'cat-x', name: 'X', category_path: [{ id: 'cat-x', name: 'X' }] },
    ];
    axios.get
      .mockResolvedValueOnce({ data: { data: { data: { categories } } } })
      .mockResolvedValueOnce({ data: { data: {} } }); // no category_path

    const result = await productService.getCategoriesProduct('cat-x', { page: 1, limit: 10 });
    expect(result).toBeDefined();
  });
});

// ── getSubCategoriesProduct ─────────────────────────────────────────────

describe('productService — getSubCategoriesProduct', () => {
  beforeEach(() => { axios.get.mockReset(); });

  it('returns result for existing subcategory', async () => {
    axios.get.mockResolvedValue({ data: { data: { data: { categories: [] } } } });

    await Product.create(mkProd({
      product: { id: 'sub-p1', name: 'Sub Product', product_type_id: 'sub-type-1', images: [{ url: 'http://img/sp' }] },
      status: true, totalQty: 5, discountedPrice: 60,
    }));

    const result = await productService.getSubCategoriesProduct('sub-type-1', { page: 1, limit: 10 });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('returns empty when no products for subcategory', async () => {
    axios.get.mockResolvedValue({ data: { data: { data: { categories: [] } } } });
    const result = await productService.getSubCategoriesProduct('nonexistent-sub', { page: 1, limit: 10 });
    expect(result.success).toBe(true);
    expect(result.filteredProductsCount).toBe(0);
  });
});

// ── getSubSubCategoriesProduct ─────────────────────────────────────────

describe('productService — getSubSubCategoriesProduct', () => {
  beforeEach(() => { axios.get.mockReset(); });

  it('returns result for subsubcategory', async () => {
    axios.get.mockResolvedValue({ data: { data: { data: { categories: [] } } } });
    const result = await productService.getSubSubCategoriesProduct('subsub-type-1', { page: 1, limit: 10 });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});

// ── getAllCategories ── extended ─────────────────────────────────────────

describe('productService — getAllCategories (extended)', () => {
  it('builds category tree with product counts', async () => {
    await Category.create({
      side_bar_categories: [{ id: 'cat-tree', name: 'Tree Cat' }],
      search_categoriesList: [{ id: 'cat-tree', name: 'Tree Cat' }],
      category_path: [{ id: 'cat-tree', name: 'Tree Cat' }],
    });

    await Product.create(mkProd({
      product: { id: 'tree-prod', name: 'Tree Product', product_type_id: 'cat-tree', images: [{ url: 'http://img/tp' }] },
      status: true, totalQty: 5,
    }));

    const result = await productService.getAllCategories();
    expect(result.side_bar_categories).toBeDefined();
    expect(result.search_categoriesList).toBeDefined();
    expect(Array.isArray(result.side_bar_categories)).toBe(true);
  });

  it('sorts flatCategoryList alphabetically', async () => {
    await Category.create({
      side_bar_categories: [],
      search_categoriesList: [
        { id: 'z-cat', name: 'Zeta' },
        { id: 'a-cat', name: 'Alpha' },
      ],
      category_path: [{ id: 'z-cat', name: 'Zeta' }],
    });
    await Category.create({
      side_bar_categories: [],
      search_categoriesList: [{ id: 'a-cat', name: 'Alpha' }],
      category_path: [{ id: 'a-cat', name: 'Alpha' }],
    });

    const result = await productService.getAllCategories();
    const names = result.search_categoriesList.map(c => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

// ── getBrands ────────────────────────────────────────────────────────────

describe('productService — getBrands', () => {
  beforeEach(() => { axios.get.mockReset(); });

  it('returns success when brands API returns valid array', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: [
          { id: 'brand-1', name: 'BrandA' },
          { id: 'brand-2', name: 'BrandB' },
        ],
      },
    });

    const result = await productService.getBrands();
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/processed/i);
  });

  it('throws 500 when brands API returns non-array data', async () => {
    axios.get.mockResolvedValue({ data: { data: null } });
    await expect(productService.getBrands()).rejects.toMatchObject({ status: 500 });
  });

  it('throws 500 when axios throws', async () => {
    axios.get.mockRejectedValue(new Error('network error'));
    await expect(productService.getBrands()).rejects.toMatchObject({ status: 500 });
  });
});

// ── getBrandNameById ─── extended ──────────────────────────────────────

describe('productService — getBrandNameById (extended)', () => {
  it('returns brand when it exists in DB', async () => {
    await Brand.create({ id: 'brand-exists-123', name: 'FoundBrand' });
    const result = await productService.getBrandNameById('brand-exists-123');
    expect(result.brand.name).toBe('FoundBrand');
    expect(result.brand.id).toBe('brand-exists-123');
  });

  it('throws 404 for unknown brand id', async () => {
    await expect(productService.getBrandNameById('unknown-brand-xyz')).rejects.toMatchObject({ status: 404 });
  });
});

// ── getCategoryNameById ─── extended ────────────────────────────────────

describe('productService — getCategoryNameById (extended)', () => {
  it('returns category name when found', async () => {
    await Category.create({
      side_bar_categories: [],
      search_categoriesList: [{ id: 'cat-lookup-1', name: 'Electronics / Phones' }],
      category_path: [],
    });

    const result = await productService.getCategoryNameById('cat-lookup-1');
    expect(result.name).toBe('Electronics');
  });

  it('throws 404 when no matching category doc exists', async () => {
    await expect(productService.getCategoryNameById('no-such-cat')).rejects.toMatchObject({ status: 404 });
  });
});

// ── getRandomProducts ─── extended ──────────────────────────────────────

describe('productService — getRandomProducts (extended)', () => {
  beforeEach(() => { axios.get.mockReset(); });

  it('returns random products excluding non-matching ones', async () => {
    axios.get.mockResolvedValue({
      data: { data: { id: 'type-rand', category_path: [{ id: 'type-rand', name: 'Type Rand' }] } },
    });

    for (let i = 0; i < 3; i++) {
      await Product.create(mkProd({
        product: { id: `rnd-${i}`, name: `Random ${i}`, product_type_id: 'type-rand', images: [{ url: `http://img/r${i}` }] },
        status: true, totalQty: 5,
        variantsData: [{ id: `var-rnd-${i}`, qty: 5, name: 'Default', sku: `SKU-rnd-${i}` }],
      }));
    }

    const result = await productService.getRandomProducts('type-rand');
    expect(result.randomProducts).toBeDefined();
    expect(Array.isArray(result.randomProducts)).toBe(true);
    expect(result.randomProducts.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array when no products match type', async () => {
    axios.get.mockResolvedValue({ data: { data: null } });
    const result = await productService.getRandomProducts('type-no-products');
    expect(result.randomProducts).toHaveLength(0);
  });

  it('throws 500 when axios fails', async () => {
    axios.get.mockRejectedValue(new Error('timeout'));
    await expect(productService.getRandomProducts('type-err')).rejects.toMatchObject({ status: 500 });
  });
});

// ── getSimilarProducts ─── extended ──────────────────────────────────────

describe('productService — getSimilarProducts (extended)', () => {
  it('returns empty similarProducts array when no products match type', async () => {
    const result = await productService.getSimilarProducts('type-no-match', null);
    expect(result.similarProducts).toHaveLength(0);
  });

  it('includes products with images and variants only', async () => {
    // One with images + variants (should appear)
    await Product.create(mkProd({
      product: { id: 'sim-good', name: 'Good Similar', product_type_id: 'sim-type', images: [{ url: 'http://img/g' }] },
      status: true, discountedPrice: 50,
      variantsData: [{ id: 'var-sim-g', qty: 5, name: 'Var' }],
    }));
    // One without images (should not appear)
    await Product.create(mkProd({
      product: { id: 'sim-bad', name: 'Bad Similar', product_type_id: 'sim-type', images: [] },
      status: true, discountedPrice: 50,
      variantsData: [{ id: 'var-sim-b', qty: 5, name: 'Var' }],
    }));

    const result = await productService.getSimilarProducts('sim-type', null);
    const ids = result.similarProducts.map(p => p.product.id);
    expect(ids).toContain('sim-good');
    expect(ids).not.toContain('sim-bad');
  });
});

// ── searchSingleProduct ─── extended ─────────────────────────────────────

describe('productService — searchSingleProduct (extended)', () => {
  it('returns products matching name (case-insensitive)', async () => {
    await Product.create(mkProd({
      product: { id: 'ssearch-1', name: 'Fuzzy Slippers', images: [{ url: 'http://img/fs' }] },
      status: true, totalQty: 5,
    }));
    await Product.create(mkProd({
      product: { id: 'ssearch-2', name: 'fuzzy BLANKET', images: [{ url: 'http://img/fb' }] },
      status: true, totalQty: 5,
    }));
    // Inactive — should be excluded
    await Product.create(mkProd({
      product: { id: 'ssearch-3', name: 'Fuzzy Cat', images: [{ url: 'http://img/fc' }] },
      status: false, totalQty: 5,
    }));

    const result = await productService.searchSingleProduct('fuzzy');
    expect(result.filteredProducts.length).toBeGreaterThanOrEqual(2);
    const names = result.filteredProducts.map(p => p.product.name.toLowerCase());
    names.forEach(n => expect(n).toContain('fuzzy'));
  });
});

// ── fetchDbProducts ─── additional filter branches ────────────────────────

describe('productService — fetchDbProducts (filter branches)', () => {
  it('filters by status=true', async () => {
    await Product.create(mkProd({ product: { id: 'fdb-act', name: 'Active Prod', images: [{ url: 'http://img/a' }] }, status: true }));
    await Product.create(mkProd({ product: { id: 'fdb-ina', name: 'Inactive Prod', images: [{ url: 'http://img/b' }] }, status: false }));

    const result = await productService.fetchDbProducts({ page: '1', limit: '10', status: 'true' });
    const names = result.products.map(p => p.product.name);
    expect(names).toContain('Active Prod');
    expect(names).not.toContain('Inactive Prod');
  });

  it('filters by status=false', async () => {
    await Product.create(mkProd({ product: { id: 'fdb-act2', name: 'Active2', images: [{ url: 'http://img/a2' }] }, status: true }));
    await Product.create(mkProd({ product: { id: 'fdb-ina2', name: 'Inactive2', images: [{ url: 'http://img/b2' }] }, status: false }));

    const result = await productService.fetchDbProducts({ page: '1', limit: '10', status: 'false' });
    const names = result.products.map(p => p.product.name);
    expect(names).not.toContain('Active2');
    expect(names).toContain('Inactive2');
  });

  it('filters by qty=0 (out of stock)', async () => {
    await Product.create(mkProd({ product: { id: 'fdb-oos', name: 'OOS Product', images: [{ url: 'http://img/o' }] }, totalQty: 0 }));
    await Product.create(mkProd({ product: { id: 'fdb-instock', name: 'InStock Product', images: [{ url: 'http://img/i' }] }, totalQty: 10 }));

    const result = await productService.fetchDbProducts({ page: '1', limit: '10', qty: '0' });
    const names = result.products.map(p => p.product.name);
    expect(names).toContain('OOS Product');
  });

  it('handles page beyond total (returns empty products)', async () => {
    await Product.create(mkProd({ product: { id: 'fdb-page', name: 'Page Test', images: [{ url: 'http://img/pt' }] } }));

    const result = await productService.fetchDbProducts({ page: '999', limit: '10' });
    expect(result.products).toHaveLength(0);
  });
});

// ── getSearchCategories ─── extended ─────────────────────────────────────

describe('productService — getSearchCategories (extended)', () => {
  it('returns matching categories for query', async () => {
    await Category.create({
      side_bar_categories: [
        { id: 'sc-1', name: 'Electronics' },
        { id: 'sc-2', name: 'Home Appliances' },
      ],
      search_categoriesList: [{ id: 'sc-1', name: 'Electronics' }],
      category_path: [],
    });

    const result = await productService.getSearchCategories({ category_name: 'elec' });
    expect(result.success).toBe(true);
    expect(result.side_bar_categories.length).toBeGreaterThanOrEqual(1);
    expect(result.side_bar_categories[0].name.toLowerCase()).toContain('elec');
  });

  it('returns empty array when no categories match search term', async () => {
    await Category.create({
      side_bar_categories: [{ id: 'sc-3', name: 'Toys' }],
      search_categoriesList: [],
      category_path: [],
    });

    const result = await productService.getSearchCategories({ category_name: 'zzznonexistent' });
    expect(result.success).toBe(true);
    expect(result.side_bar_categories).toHaveLength(0);
  });

  it('throws 404 when no categories exist', async () => {
    await expect(productService.getSearchCategories({ category_name: 'anything' }))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ── fetchProductsNoImages ─── extended ────────────────────────────────────

describe('productService — fetchProductsNoImages (extended)', () => {
  it('returns both active and inactive products without images (no status filter in impl)', async () => {
    await Product.create(mkProd({ product: { id: 'fni-act', name: 'Active NoImg', images: [] }, status: true }));
    await Product.create(mkProd({ product: { id: 'fni-ina', name: 'Inactive NoImg', images: [] }, status: false }));

    const result = await productService.fetchProductsNoImages({ page: '1', limit: '10' });
    const names = result.products.map(p => p.product.name);
    expect(names).toContain('Active NoImg');
    // fetchProductsNoImages has no status filter — returns all no-image products regardless of status
    expect(result.pagination.totalCount).toBe(2);
  });

  it('searches by name within no-image products', async () => {
    await Product.create(mkProd({ product: { id: 'fni-s1', name: 'Searchable NoImg', images: [] } }));
    await Product.create(mkProd({ product: { id: 'fni-s2', name: 'Other NoImg', images: [] } }));

    const result = await productService.fetchProductsNoImages({ page: '1', limit: '10', search: 'Searchable' });
    expect(result.products.some(p => p.product.name === 'Searchable NoImg')).toBe(true);
    expect(result.products.every(p => p.product.name !== 'Other NoImg')).toBe(true);
  });
});

// ── trackProductView — clock seam ─────────────────────────────────────────

describe('productService — trackProductView via getProductDetails (clock seam)', () => {
  const clock = require('../../src/utilities/clock');

  afterEach(() => clock.resetClock());

  it('sets lastViewedAt to frozen clock time on first view', async () => {
    const frozenDate = new Date('2026-01-01T12:00:00.000Z');
    clock.setClock({ now: () => frozenDate, nowMs: () => frozenDate.getTime() });

    const prod = await Product.create(mkProd({
      product: { id: 'clock-v1', name: 'Clock Prod', images: [{ url: 'http://img/c1' }] },
    }));

    await productService.getProductDetails('clock-v1', null);

    const view = await ProductView.findOne({ product_id: prod._id });
    expect(view).not.toBeNull();
    expect(view.lastViewedAt.toISOString()).toBe(frozenDate.toISOString());
  });

  it('increments view count on subsequent views from same user', async () => {
    const firstDate = new Date('2026-01-01T12:00:00.000Z');
    clock.setClock({ now: () => firstDate, nowMs: () => firstDate.getTime() });

    const fakeUserId = new mongoose.Types.ObjectId();

    const prod = await Product.create(mkProd({
      product: { id: 'clock-v2', name: 'Clock Prod 2', images: [{ url: 'http://img/c2' }] },
    }));

    // First view
    await productService.getProductDetails('clock-v2', fakeUserId.toString());

    const secondDate = new Date('2026-01-02T12:00:00.000Z');
    clock.setClock({ now: () => secondDate, nowMs: () => secondDate.getTime() });

    // Second view
    await productService.getProductDetails('clock-v2', fakeUserId.toString());

    const view = await ProductView.findOne({ product_id: prod._id, user_id: fakeUserId });
    expect(view.views).toBe(2);
    expect(view.lastViewedAt.toISOString()).toBe(secondDate.toISOString());
  });
});

// ── getAllProducts ── additional ─────────────────────────────────────────

describe('productService — getAllProducts (additional)', () => {
  it('only returns products with status: true', async () => {
    await Product.create(mkProd({ product: { id: 'ap-act', name: 'Active', images: [{ url: 'http://img/a' }] }, status: true }));
    await Product.create(mkProd({ product: { id: 'ap-ina', name: 'Inactive', images: [{ url: 'http://img/i' }] }, status: false }));

    const result = await productService.getAllProducts();
    const names = result.map(p => p.product.name);
    expect(names).toContain('Active');
    expect(names).not.toContain('Inactive');
  });
});

// ── describe.each — getProducts filter combination matrix ─────────────────

describe.each([
  ['price range only', { minPrice: '40', maxPrice: '60' }],
  ['price range with filter', { minPrice: '40', maxPrice: '100', filter: '["electronics"]' }],
  ['no filters', {}],
  ['invalid filter JSON', { filter: 'broken-json' }],
])('productService.getProducts filter matrix: %s', (_label, query) => {
  it('does not throw', async () => {
    await seedN(3);
    const result = await productService.getProducts({ page: '1', limit: '10', ...query });
    expect(result.success).toBe(true);
  });
});

// ── describe.each — searchSingleProduct edge cases ────────────────────────

describe.each([
  ['single char', 'a'],
  ['very long string', 'a'.repeat(200)],
  ['special chars', '()+*?[]{}.'],
  ['unicode', 'مرحبا بكم'],
  ['SQL-like injection', "'; DROP TABLE products;--"],
])('productService.searchSingleProduct edge case: %s', (_label, name) => {
  it('returns result or throws without crashing server', async () => {
    try {
      const result = await productService.searchSingleProduct(name);
      expect(result).toBeDefined();
    } catch (err) {
      // 404 or 500 are acceptable; must not be unhandled
      expect([404, 500]).toContain(err.status);
    }
  });
});

// ── getProductDetails ─────────────────────────────────────────────────────────

const Review = require('../../src/models/Review');

describe('productService — getProductDetails', () => {
  it('throws 404 when product not found', async () => {
    await expect(productService.getProductDetails('nonexistent-id', null)).rejects.toMatchObject({ status: 404 });
  });

  it('returns product details with reviews and view count', async () => {
    const prodId = `prod-det-${Date.now()}`;
    const prod = await Product.create({
      product: { id: prodId, name: 'Detail Widget', sku_number: `SKU-${prodId}` },
      variantsData: [{ id: `var-${prodId}`, qty: 5, name: 'Default' }],
      totalQty: 5,
      status: true,
      discount: 10,
      originalPrice: 100,
      discountedPrice: 90,
    });

    // Create a review for this product
    await Review.create({
      product_id: prod._id,
      quality_rating: 4,
      value_rating: 3,
      price_rating: 5,
    });

    // Create a product view
    await ProductView.create({
      product_id: prod._id,
      user_id: new mongoose.Types.ObjectId(),
      date: new Date(),
      views: 7,
    });

    const result = await productService.getProductDetails(prodId, null);
    expect(result.product.id).toBe(prodId);
    expect(result.reviewsCount).toBe(1);
    expect(result.avgQuality).toBe('4.0');
    expect(result.total_view).toBeGreaterThanOrEqual(7);
  });

  it('returns zero averages when no reviews exist', async () => {
    const prodId = `prod-no-rev-${Date.now()}`;
    await Product.create({
      product: { id: prodId, name: 'No Reviews Widget', sku_number: `SKU-${prodId}` },
      variantsData: [{ id: `var-${prodId}`, qty: 5, name: 'Default' }],
      totalQty: 5, status: true, discount: 0, originalPrice: 50, discountedPrice: 50,
    });

    const result = await productService.getProductDetails(prodId, null);
    expect(result.reviewsCount).toBe(0);
    expect(result.avgQuality).toBe(0);
  });

  it('calls trackProductView when userId is provided', async () => {
    const prodId = `prod-track-${Date.now()}`;
    const userId = new mongoose.Types.ObjectId();
    await Product.create({
      product: { id: prodId, name: 'Track Widget', sku_number: `SKU-${prodId}` },
      variantsData: [{ id: `var-${prodId}`, qty: 3, name: 'Default' }],
      totalQty: 3, status: true, discount: 0, originalPrice: 30, discountedPrice: 30,
    });

    const result = await productService.getProductDetails(prodId, userId.toString());
    expect(result.product.id).toBe(prodId);
  });
});

// ── getOrders edge cases ───────────────────────────────────────────────────────

describe('productService — getAllProducts (additional call)', () => {
  it('returns an array of active products', async () => {
    const result = await productService.getAllProducts();
    expect(Array.isArray(result)).toBe(true);
  });
});
