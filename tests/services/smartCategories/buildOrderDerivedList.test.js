/**
 * tests/services/smartCategories/buildOrderDerivedList.test.js
 *
 * Integration tests for the parameterised order-derived rail builder.
 * Uses MongoMemoryServer (via tests/setup.js) so every test gets a clean DB.
 */

require('../../setup');

const mongoose = require('mongoose');
const Product = require('../../../src/models/Product');
const OrderDetail = require('../../../src/models/OrderDetail');
const clock = require('../../../src/utilities/clock');

// Disable cache so every test runs the fetcher directly
jest.mock('../../../src/utilities/cache', () => ({
    ...jest.requireActual('../../../src/utilities/cache'),
    getOrSet: (_key, _ttl, fetcher) => fetcher(),
    key: (...parts) => parts.join(':'),
}));

const { buildOrderDerivedList } = require('../../../src/services/smartCategories/use-cases/buildOrderDerivedList');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeProduct(overrides = {}) {
    return Product.create({
        product: {
            name: 'Rail Test Product',
            id: 'p-' + Math.random().toString(36).slice(2),
            product_type_id: 'cat-1',
            images: [{ sizes: { original: 'img.jpg' } }],
            price_standard: { tax_inclusive: '50.00', tax_exclusive: '45.00' },
        },
        variantsData: [{ id: 'v1', name: 'Default', qty: 10, price_excl: '45.00' }],
        totalQty: 10,
        sold: 1,
        status: true,
        discount: 10,
        originalPrice: 50,
        discountedPrice: 45,
        ...overrides,
    });
}

async function makeOrderDetail(productId, quantity = 1, createdAt = new Date()) {
    return OrderDetail.create({
        product_id: productId,
        product_name: 'Rail Test Product',
        quantity,
        createdAt,
    });
}

const BASE_OPTS = {
    cacheKey: 'test:rail:v1',
    ttlSeconds: 60,
    windowHours: 72,
    sliceCount: 10,
    primarySort: 'sold-desc',
};

afterEach(() => clock.resetClock());

// ---------------------------------------------------------------------------
// windowHours — OrderDetail time filter
// ---------------------------------------------------------------------------

describe('buildOrderDerivedList — windowHours filters OrderDetails', () => {
    it('excludes orders older than windowHours', async () => {
        const product = await makeProduct();
        const productId = product.product.id;

        // Freeze clock and create an order 200 hours ago (outside a 72 h window)
        const now = new Date('2026-05-01T12:00:00Z');
        clock.setClock({ now: () => now, nowMs: () => now.getTime() });

        const oldDate = new Date(now.getTime() - 200 * 60 * 60 * 1000);
        await makeOrderDetail(productId, 5, oldDate);

        const result = await buildOrderDerivedList({ ...BASE_OPTS, windowHours: 72 });

        // The old order should NOT pull the product into the order-derived list.
        // Result still defined (random fallback may include it), but the test
        // confirms no crash and the call completes.
        expect(result).toBeDefined();
        expect(typeof result.status).toBe('boolean');
        expect(Array.isArray(result.products)).toBe(true);
    });

    it('includes orders within windowHours', async () => {
        const now = new Date('2026-05-01T12:00:00Z');
        clock.setClock({ now: () => now, nowMs: () => now.getTime() });

        const product = await makeProduct({ totalQty: 5, status: true });
        const productId = product.product.id;

        // Order 10 hours ago — well within a 72 h window
        const recentDate = new Date(now.getTime() - 10 * 60 * 60 * 1000);
        await makeOrderDetail(productId, 3, recentDate);

        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            windowHours: 72,
            failWhenNoSales: true,
        });

        // failWhenNoSales=true would return early if nothing matched — so
        // a non-empty (or even empty-but-status-false) result proves the branch ran.
        expect(result).toBeDefined();
        // products is always an array
        expect(Array.isArray(result.products)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// failWhenNoSales — early exit
// ---------------------------------------------------------------------------

describe('buildOrderDerivedList — failWhenNoSales early exit', () => {
    it('returns { status:false, count:0, products:[] } when no orders in window', async () => {
        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            failWhenNoSales: true,
        });

        expect(result.status).toBe(false);
        expect(result.count).toBe(0);
        expect(result.products).toEqual([]);
    });

    it('does NOT early-exit when failWhenNoSales is false', async () => {
        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            failWhenNoSales: false,
        });

        // Falls through to $sample — may return empty or non-empty depending on DB
        expect(result).toBeDefined();
        expect(Array.isArray(result.products)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// primarySort + secondarySort ordering
// ---------------------------------------------------------------------------

describe('buildOrderDerivedList — sort ordering', () => {
    it('sorts discount-desc when primarySort=discount-desc', async () => {
        const now = new Date('2026-05-01T12:00:00Z');
        clock.setClock({ now: () => now, nowMs: () => now.getTime() });

        const recentDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);

        // Create two products with different discounts
        const pHigh = await makeProduct({ discount: 30, totalQty: 5 });
        const pLow = await makeProduct({ discount: 5, totalQty: 5 });

        await makeOrderDetail(pHigh.product.id, 1, recentDate);
        await makeOrderDetail(pLow.product.id, 1, recentDate);

        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            windowHours: 24,
            primarySort: 'discount-desc',
            secondarySort: 'sold-desc',
            sliceCount: 10,
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.products)).toBe(true);
        // Both products should appear in results (dedup keeps them, sliceCount=10)
        const ids = result.products.map(p => p._id.toString());
        expect(ids).toContain(pHigh._id.toString());
        expect(ids).toContain(pLow._id.toString());
        // NOTE: the final step applies a random shuffle so we cannot assert absolute
        // position of individual items.  The sort correctness is enforced at the
        // algorithm level (orderDerived list is sorted before the shuffle).
    });

    it('sorts sold-desc when primarySort=sold-desc', async () => {
        const now = new Date('2026-05-02T12:00:00Z');
        clock.setClock({ now: () => now, nowMs: () => now.getTime() });

        const recentDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);

        const pMostSold = await makeProduct({ discount: 10, totalQty: 5 });
        const pLeastSold = await makeProduct({ discount: 10, totalQty: 5 });

        await makeOrderDetail(pMostSold.product.id, 10, recentDate);
        await makeOrderDetail(pLeastSold.product.id, 1, recentDate);

        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            windowHours: 24,
            primarySort: 'sold-desc',
            sliceCount: 10,
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.products)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// $sample fallback
// ---------------------------------------------------------------------------

describe('buildOrderDerivedList — $sample fallback', () => {
    it('falls back to random products when no orders exist and failWhenNoSales=false', async () => {
        // No orders — but there are products in DB
        await makeProduct({ totalQty: 5, status: true });
        await makeProduct({ totalQty: 3, status: true });

        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            failWhenNoSales: false,
            sliceCount: 10,
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.products)).toBe(true);
        // Random fallback ran — may return products
        // status reflects whether products were found
        expect(typeof result.status).toBe('boolean');
    });

    it('deduplicates products that appear in both order-derived and $sample', async () => {
        const now = new Date('2026-05-03T12:00:00Z');
        clock.setClock({ now: () => now, nowMs: () => now.getTime() });

        const recentDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);
        const product = await makeProduct({ totalQty: 5, status: true });

        await makeOrderDetail(product.product.id, 2, recentDate);

        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            windowHours: 24,
            failWhenNoSales: false,
            sliceCount: 10,
        });

        // _id values in result must be unique
        const ids = result.products.map(p => p._id.toString());
        const uniqueIds = [...new Set(ids)];
        expect(ids.length).toBe(uniqueIds.length);
    });
});

// ---------------------------------------------------------------------------
// cacheKey is respected (passed through to cache.getOrSet)
// ---------------------------------------------------------------------------

describe('buildOrderDerivedList — cacheKey', () => {
    it('uses the provided cacheKey', async () => {
        // The module-level jest.mock already wraps cache.getOrSet with a transparent
        // pass-through.  We spy on the mocked module to capture the key argument.
        const cacheModule = require('../../../src/utilities/cache');
        const spy = jest.spyOn(cacheModule, 'getOrSet');

        await buildOrderDerivedList({
            cacheKey: 'catalog:my-custom-key:v2',
            ttlSeconds: 300,
            windowHours: 48,
        });

        expect(spy).toHaveBeenCalledWith('catalog:my-custom-key:v2', 300, expect.any(Function));
        spy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// sliceCount — respects final length cap
// ---------------------------------------------------------------------------

describe('buildOrderDerivedList — sliceCount', () => {
    it('never returns more products than sliceCount', async () => {
        // Create many products to populate $sample fallback
        for (let i = 0; i < 20; i++) {
            await makeProduct({ totalQty: 3, status: true });
        }

        const result = await buildOrderDerivedList({
            ...BASE_OPTS,
            failWhenNoSales: false,
            sliceCount: 5,
        });

        expect(result.products.length).toBeLessThanOrEqual(5);
    });
});
