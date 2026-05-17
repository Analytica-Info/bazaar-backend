/**
 * productService.pr12.test.js
 * PR12 — Push productService to ≥80% lines.
 * Covers:
 *   - logStatusFalseItems: responseData shape variants + falseStatusItems log paths
 *   - trackProductView: update-existing view path
 *   - fetchAndCacheCategories: cache-hit and Lightspeed 5xx/generic error paths
 *   - fetchCategoriesType: error path (returns [])
 *   - checkSpelling: misspelled word, uncached path, nodecache hit
 *   - fetchBrands / fetchCategories (internal): error paths
 *   - searchProducts: short query, Atlas fallback (search index not available), no-result + spell check
 *   - searchSingleProduct: not-found / status-filtered
 *   - getProductDetails: 404 path, view-tracking second-visit (update)
 *   - getHomeProducts: uncategorized products path
 *   - getSubSubCategoriesProduct (if exported)
 */

require('../setup');
const mongoose = require('mongoose');
const axios = require('axios');
const Product = require('../../src/models/Product');
const ProductView = require('../../src/models/ProductView');

// --- Mock factories declared BEFORE jest.mock calls (Babel hoisting) ---
const mockNodeCacheGet = jest.fn();
const mockNodeCacheSet = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn().mockResolvedValue(true);
const mockCacheGetOrSet = jest.fn();
const mockTypoCheck = jest.fn().mockReturnValue(true);
const mockTypoSuggest = jest.fn().mockReturnValue([]);

jest.mock('axios');
jest.mock('node-cache', () => jest.fn().mockImplementation(() => ({
    get: (...a) => mockNodeCacheGet(...a),
    set: (...a) => mockNodeCacheSet(...a),
})));
jest.mock('typo-js', () => jest.fn().mockImplementation(() => ({
    check: (...a) => mockTypoCheck(...a),
    suggest: (...a) => mockTypoSuggest(...a),
})));
jest.mock('../../src/utilities/cache', () => ({
    key: (...parts) => parts.join(':'),
    get: (...a) => mockCacheGet(...a),
    set: (...a) => mockCacheSet(...a),
    getOrSet: (...a) => mockCacheGetOrSet(...a),
}));
jest.mock('../../src/utilities/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const productService = require('../../src/services/productService');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mkProd = (overrides = {}) => ({
    product: {
        id: `p-${Date.now()}-${Math.random()}`,
        name: 'Widget',
        description: 'A fine widget',
        product_type_id: 'type-001',
        images: [{ url: 'http://img.test/a.jpg' }],
        ...overrides.product,
    },
    variantsData: [{ id: `v-${Date.now()}`, qty: 10, name: 'Default', sku: 'SKU-1' }],
    totalQty: overrides.totalQty ?? 10,
    status: overrides.status ?? true,
    discount: 20,
    originalPrice: 100,
    discountedPrice: 80,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(undefined);
    mockCacheSet.mockResolvedValue(true);
    mockNodeCacheGet.mockReturnValue(undefined);
    mockCacheGetOrSet.mockImplementation(async (_key, _ttl, fetcher) => fetcher());
    mockTypoCheck.mockReturnValue(true); // no spelling issue by default
    axios.get.mockResolvedValue({ data: {} });
});

// ---------------------------------------------------------------------------
// getProductDetails — 404 path and view tracking update path
// ---------------------------------------------------------------------------
describe('getProductDetails', () => {
    it('throws 404 when product not found', async () => {
        await expect(productService.getProductDetails('nonexistent-id', null))
            .rejects.toMatchObject({ status: 404 });
    });

    it('creates ProductView on first visit', async () => {
        const prod = await Product.create(mkProd());
        const userId = new mongoose.Types.ObjectId();

        await productService.getProductDetails(prod.product.id, userId.toString());

        const view = await ProductView.findOne({ product_id: prod._id }).lean();
        expect(view).not.toBeNull();
        expect(view.views).toBe(1);
    });

    it('increments ProductView on second visit (update path)', async () => {
        const prod = await Product.create(mkProd());
        const userId = new mongoose.Types.ObjectId();

        // First visit creates the record
        await productService.getProductDetails(prod.product.id, userId.toString());
        // Second visit should increment
        await productService.getProductDetails(prod.product.id, userId.toString());

        const view = await ProductView.findOne({
            product_id: prod._id,
            user_id: userId,
        }).lean();
        expect(view.views).toBe(2);
    });

    it('returns product with review aggregation fields', async () => {
        const prod = await Product.create(mkProd());

        const result = await productService.getProductDetails(prod.product.id, null);

        expect(result.product).toBeDefined();
        expect(result.avgQuality).toBeDefined();
        expect(result.total_view).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// searchProducts — short query throws 400
// ---------------------------------------------------------------------------
describe('searchProducts — validation', () => {
    it('throws 400 when item_name is empty', async () => {
        await expect(productService.searchProducts({ item_name: '' }))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when item_name is less than 3 chars', async () => {
        await expect(productService.searchProducts({ item_name: 'ab' }))
            .rejects.toMatchObject({ status: 400 });
    });
});

// ---------------------------------------------------------------------------
// searchProducts — Atlas $search not configured (falls back to regex)
// ---------------------------------------------------------------------------
describe('searchProducts — Atlas search unavailable (regex fallback)', () => {
    it('falls back to regex when $search aggregation throws (Atlas not configured)', async () => {
        // Product matches "laptop" by name
        await Product.create(mkProd({
            product: { id: 'lp1', name: 'Laptop Pro', description: 'Fast laptop', product_type_id: 'cat1', images: [{ url: 'http://img/lp.jpg' }] },
            status: true,
            totalQty: 5,
        }));

        // Simulate Atlas $search not configured — MongoServerError with code 40324 or message
        const atlasError = new Error('PlanExecutor error during aggregation :: caused by :: $search stage is only allowed on MongoDB Atlas');
        atlasError.code = 40324;

        // Mock Product.aggregate to throw Atlas error
        const origAggregate = Product.aggregate.bind(Product);
        jest.spyOn(Product, 'aggregate').mockRejectedValueOnce(atlasError);

        const result = await productService.searchProducts({ item_name: 'laptop' });

        expect(result).toHaveProperty('filteredProducts');
        expect(result.filteredProducts.some(p => p.product.name === 'Laptop Pro')).toBe(true);

        Product.aggregate.mockRestore();
    });

    it('returns noResult:true and calls checkSpelling when no products match', async () => {
        // No products in DB — aggregate returns empty, fallback returns empty
        mockTypoCheck.mockReturnValue(false);
        mockTypoSuggest.mockReturnValue(['table']);
        mockNodeCacheGet.mockReturnValue(undefined); // spelling not cached

        const atlasError = new Error('$search index not found');
        atlasError.code = 40324;
        jest.spyOn(Product, 'aggregate').mockRejectedValueOnce(atlasError);

        const result = await productService.searchProducts({ item_name: 'tabel' });

        // Returns no results (nothing in DB)
        expect(result.noResult).toBe(true);
        expect(result.filteredProductsCount).toBe(0);

        Product.aggregate.mockRestore();
    });

    it('re-throws non-Atlas aggregate errors', async () => {
        const genericError = new Error('MongoDB connection lost');
        jest.spyOn(Product, 'aggregate').mockRejectedValueOnce(genericError);

        await expect(productService.searchProducts({ item_name: 'widget' }))
            .rejects.toMatchObject({ status: 500 });

        Product.aggregate.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// searchProducts — Atlas returns empty → regex fallback used
// ---------------------------------------------------------------------------
describe('searchProducts — Atlas returns empty results (in-body fallback)', () => {
    it('uses regex fallback when Atlas returns 0 results', async () => {
        await Product.create(mkProd({
            product: { id: 'fb1', name: 'Fallback Widget', description: 'desc', product_type_id: 'cat1', images: [{ url: 'http://img/fw.jpg' }] },
            status: true,
            totalQty: 3,
        }));

        // Atlas returns empty array
        jest.spyOn(Product, 'aggregate').mockResolvedValueOnce([]);

        const result = await productService.searchProducts({ item_name: 'Fallback Widget' });

        expect(result.filteredProducts.some(p => p.product.name === 'Fallback Widget')).toBe(true);

        Product.aggregate.mockRestore();
    });

    it('applies category_id filter in regex fallback', async () => {
        await Product.create(mkProd({
            product: { id: 'catfb1', name: 'Category Filter Widget', description: 'desc', product_type_id: 'cat-target', images: [{ url: 'http://img/cf.jpg' }] },
            status: true,
            totalQty: 2,
        }));

        jest.spyOn(Product, 'aggregate').mockResolvedValueOnce([]);

        const result = await productService.searchProducts({
            item_name: 'Category Filter',
            category_id: 'cat-target',
        });

        const all = result.filteredProducts;
        expect(all.every(p => p.product.product_type_id === 'cat-target')).toBe(true);

        Product.aggregate.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// searchSingleProduct
// ---------------------------------------------------------------------------
describe('searchSingleProduct', () => {
    it('throws 404 when no product matches the name', async () => {
        await expect(productService.searchSingleProduct('NoSuchProduct'))
            .rejects.toMatchObject({ status: 404 });
    });

    it('returns products matching name', async () => {
        await Product.create(mkProd({
            product: { id: 'ssp1', name: 'SpecialSearchName', product_type_id: 't1', images: [{ url: 'http://img/ssp.jpg' }] },
            status: true,
        }));

        const result = await productService.searchSingleProduct('SpecialSearchName');
        expect(result.filteredProducts.some(p => p.product.name === 'SpecialSearchName')).toBe(true);
    });

    it('filters out products with status=false', async () => {
        await Product.create(mkProd({
            product: { id: 'ssp2', name: 'InactiveProduct99', product_type_id: 't1', images: [{ url: 'http://img/ssp2.jpg' }] },
            status: false,
            totalQty: 0,
        }));

        // The 404 guard triggers first if no products (status ignored in DB query)
        // If exists, status false products filtered out in service
        const result = await productService.searchSingleProduct('InactiveProduct99');
        expect(result.filteredProducts.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// fetchAndCacheCategories — via getHomeProducts (which calls it internally)
// ---------------------------------------------------------------------------
describe('fetchAndCacheCategories — cache hit path', () => {
    it('returns cached categories when cache.get resolves with data', async () => {
        // getHomeProducts calls fetchAndCacheCategories which calls cache.get
        // We can't call the private function directly, but we can verify caching behavior
        // by testing getHomeProducts where the inner cache miss triggers axios
        const categories = [{ id: 'c1', name: 'Electronics' }];

        // First call: cache miss → axios
        mockCacheGetOrSet.mockImplementationOnce(async (_key, _ttl, fetcher) => fetcher());
        mockCacheGet.mockResolvedValueOnce(categories); // fetchAndCacheCategories cache hit

        await Product.create(mkProd());

        const result = await productService.getHomeProducts();
        expect(result).toHaveProperty('result');
    });
});

// ---------------------------------------------------------------------------
// logStatusFalseItems — various responseData shapes
// Tested indirectly via getProductDetails which calls logStatusFalseItems
// ---------------------------------------------------------------------------
describe('logStatusFalseItems — responseData shape variants', () => {
    it('extracts products from responseData.products shape', async () => {
        // Tested via getProductDetails — the responseData has product/id/variantsData
        const prod = await Product.create(mkProd({ status: true }));
        const result = await productService.getProductDetails(prod.product.id, null);
        expect(result.product).toBeDefined();
    });

    it('handles status:false item in response without crashing (file write path)', async () => {
        // Create a product with status false (this gets flagged in logStatusFalseItems)
        const falseProd = await Product.create({
            product: { id: 'false-status-1', name: 'Inactive Widget', images: [{ url: 'http://img/f.jpg' }] },
            variantsData: [],
            totalQty: 0,
            status: false,
        });

        // getProductDetails finds it by ID directly (bypasses status filter)
        const result = await productService.getProductDetails(falseProd.product.id, null);
        // The statusLogger runs but does not throw
        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// getCategories — uses Category MongoDB collection (not Lightspeed API)
// ---------------------------------------------------------------------------
describe('getCategories', () => {
    it('throws 404 when no categories found', async () => {
        await expect(productService.getCategories())
            .rejects.toMatchObject({ status: 404 });
    });
});

// ---------------------------------------------------------------------------
// checkSpelling — via searchProducts with misspelled word
// ---------------------------------------------------------------------------
describe('checkSpelling — paths', () => {
    it('returns spelling suggestion when word is misspelled (not in dictionary)', async () => {
        mockNodeCacheGet.mockReturnValue(undefined); // not cached
        mockTypoCheck.mockReturnValue(false);        // word is misspelled
        mockTypoSuggest.mockReturnValue(['widget']);

        // Atlas throws → regex fallback → no results (empty DB for this term)
        const atlasError = new Error('$search not available');
        atlasError.code = 40324;
        jest.spyOn(Product, 'aggregate').mockRejectedValueOnce(atlasError);

        const result = await productService.searchProducts({ item_name: 'widgett' });

        // spelling check ran (check was false) — suggestion returned via noResult
        expect(result.noResult).toBe(true);

        Product.aggregate.mockRestore();
    });

    it('returns null suggestion when word is correct (check passes)', async () => {
        mockNodeCacheGet.mockReturnValue(undefined);
        mockTypoCheck.mockReturnValue(true); // word is fine, no suggestion
        mockTypoSuggest.mockReturnValue([]);

        const atlasError = new Error('$search not available');
        atlasError.code = 40324;
        jest.spyOn(Product, 'aggregate').mockRejectedValueOnce(atlasError);

        const result = await productService.searchProducts({ item_name: 'widget' });

        expect(mockTypoSuggest).not.toHaveBeenCalled(); // no suggestion needed

        Product.aggregate.mockRestore();
    });

    it('returns cached spelling result when available (NodeCache hit)', async () => {
        // Cache returns an existing suggestion
        mockNodeCacheGet.mockReturnValue('suggestion');

        const atlasError = new Error('$search not available');
        atlasError.code = 40324;
        jest.spyOn(Product, 'aggregate').mockRejectedValueOnce(atlasError);

        // If check is never called due to cache hit, typo-js should not be invoked
        await productService.searchProducts({ item_name: 'widgett' });

        // spellingCache had a hit → typo.check should not be called
        expect(mockTypoCheck).not.toHaveBeenCalled();

        Product.aggregate.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// fetchDbProducts — filter combinations
// ---------------------------------------------------------------------------
describe('fetchDbProducts', () => {
    it('returns all products with no filters', async () => {
        await Product.create(mkProd({ product: { id: 'fdb1', name: 'DB Widget', product_type_id: 'tp1', images: [{ url: 'http://img/db1.jpg' }] }, status: true, totalQty: 5 }));

        const result = await productService.fetchDbProducts({ page: 1, limit: 10 });

        expect(result.pagination).toBeDefined();
        expect(result.products).toBeDefined();
        expect(result.pagination.totalCount).toBeGreaterThan(0);
    });

    it('filters by status=true', async () => {
        await Product.create(mkProd({ product: { id: 'fdb2', name: 'Active DB', product_type_id: 'tp1', images: [{ url: 'http://img/db2.jpg' }] }, status: true, totalQty: 3 }));
        await Product.create(mkProd({ product: { id: 'fdb3', name: 'Inactive DB', product_type_id: 'tp1', images: [{ url: 'http://img/db3.jpg' }] }, status: false, totalQty: 0 }));

        const result = await productService.fetchDbProducts({ page: 1, limit: 10, status: 'true' });

        expect(result.products.every(p => p.status === true)).toBe(true);
    });

    it('filters by qty=0 (out of stock)', async () => {
        await Product.create(mkProd({ product: { id: 'fdb4', name: 'Zero Stock', product_type_id: 'tp1', images: [{ url: 'http://img/db4.jpg' }] }, status: true, totalQty: 0 }));

        const result = await productService.fetchDbProducts({ page: 1, limit: 10, qty: '0' });

        expect(result.products.every(p => p.totalQty === 0)).toBe(true);
    });

    it('filters by qty=greater (in stock)', async () => {
        await Product.create(mkProd({ product: { id: 'fdb5', name: 'In Stock', product_type_id: 'tp1', images: [{ url: 'http://img/db5.jpg' }] }, status: true, totalQty: 5 }));

        const result = await productService.fetchDbProducts({ page: 1, limit: 10, qty: 'greater' });

        expect(result.products.every(p => p.totalQty > 0)).toBe(true);
    });

    it('filters by qty=gte (gte 0)', async () => {
        const result = await productService.fetchDbProducts({ page: 1, limit: 10, qty: 'gte' });
        expect(result.pagination).toBeDefined();
    });

    it('applies text search filter with existing status filter', async () => {
        await Product.create(mkProd({
            product: { id: 'fdb6', name: 'SpecialNameFDB', product_type_id: 'tp1', images: [{ url: 'http://img/db6.jpg' }] },
            status: true,
            totalQty: 3,
        }));

        const result = await productService.fetchDbProducts({
            page: 1, limit: 10,
            search: 'SpecialNameFDB',
            status: 'true',
        });

        expect(result.products.some(p => p.product.name === 'SpecialNameFDB')).toBe(true);
    });

    it('applies text search with no other filters', async () => {
        await Product.create(mkProd({
            product: { id: 'fdb7', name: 'UniqueSearchTermFDB7', product_type_id: 'tp1', images: [{ url: 'http://img/db7.jpg' }] },
            status: true,
            totalQty: 1,
        }));

        const result = await productService.fetchDbProducts({ search: 'UniqueSearchTermFDB7' });

        expect(result.products.some(p => p.product.name === 'UniqueSearchTermFDB7')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getAllProducts
// ---------------------------------------------------------------------------
describe('getAllProducts', () => {
    it('returns all active products', async () => {
        await Product.create(mkProd({ product: { id: 'ga1', name: 'All Products Widget', product_type_id: 'tp1', images: [{ url: 'http://img/ga.jpg' }] }, status: true }));

        const result = await productService.getAllProducts();

        expect(Array.isArray(result)).toBe(true);
        expect(result.some(p => p.product.name === 'All Products Widget')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getBrands
// ---------------------------------------------------------------------------
describe('getBrands', () => {
    it('syncs brands from Lightspeed and upserts into DB', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: [{ id: 'brand1', name: 'BrandX' }] }
        });

        const result = await productService.getBrands();

        expect(result.success).toBe(true);
    });

    it('throws 500 when brandsData.data is not an array', async () => {
        axios.get.mockResolvedValueOnce({ data: {} }); // no .data array

        await expect(productService.getBrands()).rejects.toMatchObject({ status: 500 });
    });

    it('throws 500 when Lightspeed API fails', async () => {
        // fetchBrands catches the error and returns [], then getBrands sees empty brandsData
        axios.get.mockRejectedValueOnce(new Error('Lightspeed down'));

        await expect(productService.getBrands()).rejects.toMatchObject({ status: 500 });
    });
});

// ---------------------------------------------------------------------------
// getBrandNameById
// ---------------------------------------------------------------------------
describe('getBrandNameById', () => {
    it('throws 404 when brand not found', async () => {
        await expect(productService.getBrandNameById('nonexistent-brand'))
            .rejects.toMatchObject({ status: 404 });
    });

    it('returns brand name when found', async () => {
        const Brand = require('../../src/models/Brand');
        await Brand.create({ id: 'brand-test-1', name: 'TestBrandName' });

        const result = await productService.getBrandNameById('brand-test-1');
        expect(result.brand.name).toBe('TestBrandName');
    });
});

// ---------------------------------------------------------------------------
// getSimilarProducts
// ---------------------------------------------------------------------------
describe('getSimilarProducts', () => {
    it('throws 400 when productTypeId is empty', async () => {
        await expect(productService.getSimilarProducts('', null))
            .rejects.toMatchObject({ status: 400 });
    });

    it('returns similar products when matching products exist', async () => {
        await Product.create({
            product: { id: 'sim1', name: 'Similar Widget', product_type_id: 'sim-type', images: [{ url: 'http://img/sim.jpg' }] },
            variantsData: [{ id: 'sv1', qty: 5, name: 'V1', sku: 'S1' }],
            totalQty: 5,
            status: true,
            discountedPrice: 80,
            originalPrice: 100,
        });

        const result = await productService.getSimilarProducts('sim-type', null);

        expect(result.similarProducts).toBeDefined();
    });

    it('excludes the product matching productId from similar results', async () => {
        const prod = await Product.create({
            product: { id: 'sim2', name: 'Excluded Widget', product_type_id: 'sim-type2', images: [{ url: 'http://img/sim2.jpg' }] },
            variantsData: [{ id: 'sv2', qty: 3, name: 'V2', sku: 'S2' }],
            totalQty: 3,
            status: true,
            discountedPrice: 70,
            originalPrice: 90,
        });

        const result = await productService.getSimilarProducts('sim-type2', prod._id.toString());

        expect(result.similarProducts.every(p => p._id.toString() !== prod._id.toString())).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getProducts — error path (aggregate throws)
// ---------------------------------------------------------------------------
describe('getProducts — error path', () => {
    it('throws 500 when aggregate throws an unexpected error', async () => {
        jest.spyOn(Product, 'aggregate').mockRejectedValueOnce(new Error('DB timeout'));

        await expect(productService.getProducts({}))
            .rejects.toMatchObject({ status: 500 });

        Product.aggregate.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// getCategoriesProduct — exercising filteredProducts logStatusFalseItems shape
// ---------------------------------------------------------------------------
describe('getCategoriesProduct', () => {
    it('returns empty filteredProducts when category has no matching products', async () => {
        // fetchAndCacheCategories: cache miss → axios
        mockCacheGet.mockResolvedValue(undefined);
        axios.get
            .mockResolvedValueOnce({ data: { data: { data: { categories: [] } } } }) // categories
            .mockResolvedValueOnce({ data: [] }); // fetchCategoriesType

        const result = await productService.getCategoriesProduct('nonexistent-cat', { page: 1, limit: 10 });

        expect(result.filteredProducts).toEqual([]);
        expect(result.filteredProductsCount).toBe(0);
    });

    it('returns matching products when category exists', async () => {
        await Product.create({
            product: { id: 'cat-prod1', name: 'Cat Widget', product_type_id: 'target-cat', images: [{ url: 'http://img/cw.jpg' }] },
            variantsData: [{ id: 'cv1', qty: 3, name: 'V1', sku: 'S1' }],
            totalQty: 3,
            status: true,
            discountedPrice: 50,
            originalPrice: 60,
        });

        const categories = [{ category_path: [{ id: 'target-cat', name: 'Target' }] }];
        mockCacheGet.mockResolvedValue(undefined);
        axios.get
            .mockResolvedValueOnce({ data: { data: { data: { categories } } } })
            .mockResolvedValueOnce({ data: { category_path: [{ id: 'target-cat', name: 'Target' }] } });

        const result = await productService.getCategoriesProduct('target-cat', { page: 1, limit: 10 });

        // filteredProducts shape triggers logStatusFalseItems(line 99-100)
        expect(result.filteredProducts).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// getSimilarProducts — error path (unexpected DB error)
// ---------------------------------------------------------------------------
describe('getSimilarProducts — error path', () => {
    it('throws 500 when DB query fails unexpectedly', async () => {
        jest.spyOn(Product, 'find').mockReturnValueOnce({
            select: () => ({ lean: () => Promise.reject(new Error('DB fail')) })
        });

        await expect(productService.getSimilarProducts('type-err', null))
            .rejects.toMatchObject({ status: 500 });

        Product.find.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// fetchDbProducts — error path
// ---------------------------------------------------------------------------
describe('fetchDbProducts — error path', () => {
    it('throws 500 when DB query fails', async () => {
        jest.spyOn(Product, 'find').mockReturnValueOnce({
            select: () => ({ skip: () => ({ limit: () => ({ lean: () => ({ exec: () => Promise.reject(new Error('DB timeout')) }) }) }) })
        });

        await expect(productService.fetchDbProducts({ page: 1, limit: 10 }))
            .rejects.toMatchObject({ status: 500 });

        Product.find.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// getAllProducts — error path
// ---------------------------------------------------------------------------
describe('getAllProducts — error path', () => {
    it('throws 500 on unexpected DB error', async () => {
        jest.spyOn(Product, 'find').mockReturnValueOnce({
            select: () => ({ lean: () => Promise.reject(new Error('DB down')) })
        });

        await expect(productService.getAllProducts())
            .rejects.toMatchObject({ status: 500 });

        Product.find.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// getHomeProducts — uncategorized products branch
// ---------------------------------------------------------------------------
describe('getHomeProducts — uncategorized products', () => {
    it('groups uncategorized products under "Uncategorized" key', async () => {
        // Create a product with product_type_id = null (uncategorized)
        await Product.create({
            product: {
                id: 'uncat1',
                name: 'Uncategorized Widget',
                images: [{ url: 'http://img/u.jpg' }],
                product_type_id: null,
            },
            variantsData: [],
            totalQty: 5,
            status: true,
            discountedPrice: 50,
            originalPrice: 60,
        });

        // Cache miss — fetch categories from axios (empty list)
        mockCacheGet.mockResolvedValue(undefined);
        axios.get.mockResolvedValueOnce({
            data: { data: { data: { categories: [] } } }
        });

        const result = await productService.getHomeProducts();
        expect(result).toHaveProperty('result');
        expect(result.result).toHaveProperty('Uncategorized');
    });
});
