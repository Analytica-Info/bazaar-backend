'use strict';

require('../setup');

jest.mock('axios');
jest.mock('../../src/utilities/cache', () => ({
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    key: (...parts) => parts.join(':'),
}));

const fs = require('fs');
const axios = require('axios');
const Product = require('../../src/models/Product');
const ProductId = require('../../src/models/ProductId');
const updateProducts = require('../../src/scripts/updateProducts');
const { storeProductDetails } = require('../../src/scripts/updateProducts');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeProductApiResponse = (id, overrides = {}) => ({
    data: {
        data: {
            id,
            name: `Product ${id}`,
            sku_number: `SKU-${id}`,
            is_active: true,
            ecwid_enabled_webstore: true,
            variants: [],
            price_standard: { tax_inclusive: '100.00', tax_exclusive: '95.24' },
            ...overrides,
        },
    },
});

const makeInventoryApiResponse = (level = 10) => ({
    data: { data: [{ inventory_level: level }] },
});

// Minimal Product doc shape for seeding MongoDB
const makeProductDoc = (id, overrides = {}) => ({
    product: {
        id,
        name: `Product ${id}`,
        price_standard: { tax_inclusive: '100.00', tax_exclusive: '95.24' },
    },
    variantsData: [{ id, qty: 10, price: '100.00', sku: `SKU-${id}`, name: `Product ${id}` }],
    totalQty: 10,
    status: true,
    webhook: 'cron',
    webhookTime: '10:00:00 AM - 01 January, 2026',
    ...overrides,
});

let appendFileSyncSpy;

beforeEach(() => {
    jest.clearAllMocks();
    appendFileSyncSpy = jest.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
});

afterEach(() => {
    appendFileSyncSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// ProductId registry batch upsert (Fix 1)
// ---------------------------------------------------------------------------

describe('updateProducts — ProductId registry batch upsert', () => {
    // The integration path for the ProductId batch logic runs through updateProducts(),
    // which also calls fetchProducts() and filterProductsByInventory() (Lightspeed API).
    // We test the ProductId upsert behaviour in isolation via storeProductDetails +
    // direct ProductId assertions, keeping mocks minimal.

    it('inserts only new IDs — existing ones are not duplicated', async () => {
        // Pre-seed one existing ID
        await ProductId.create({ productId: 'p_existing' });

        // Simulate 2 products: one already known, one new
        axios.get
            // storeProductDetails fetchProductDetails calls:
            .mockResolvedValueOnce(makeProductApiResponse('p_existing'))
            .mockResolvedValueOnce(makeInventoryApiResponse(5))
            .mockResolvedValueOnce(makeProductApiResponse('p_new'))
            .mockResolvedValueOnce(makeInventoryApiResponse(3));

        // We call updateProducts() via the internal path by directly invoking
        // the ProductId upsert logic through a controlled full run with mocked
        // fetchProducts and filterProductsByInventory.
        // Instead, test the ProductId batch upsert by calling updateProducts()
        // with fully mocked Lightspeed API responses.
        const productsListResponse = {
            data: {
                data: [
                    { id: 'p_existing', is_active: true, variants: [] },
                    { id: 'p_new',      is_active: true, variants: [] },
                ],
                version: { max: '' },
            },
        };
        const inventoryListResponse = {
            data: {
                data: [
                    { product_id: 'p_existing', inventory_level: 5 },
                    { product_id: 'p_new',      inventory_level: 3 },
                ],
                version: { max: '' },
            },
        };

        axios.get
            .mockReset()
            .mockResolvedValueOnce(productsListResponse)   // fetchProducts page 1
            .mockResolvedValueOnce(inventoryListResponse)  // filterProductsByInventory
            // storeProductDetails: fetchProductDetails per product
            .mockResolvedValueOnce(makeProductApiResponse('p_existing'))
            .mockResolvedValueOnce(makeInventoryApiResponse(5))
            .mockResolvedValueOnce(makeProductApiResponse('p_new'))
            .mockResolvedValueOnce(makeInventoryApiResponse(3));

        await updateProducts();

        const allIds = await ProductId.find({}).lean();
        const idValues = allIds.map((d) => d.productId);

        // p_existing should appear exactly once (not duplicated)
        expect(idValues.filter((v) => v === 'p_existing')).toHaveLength(1);
        // p_new should have been inserted
        expect(idValues).toContain('p_new');
    });

    it('does not call insertMany when all product IDs already exist', async () => {
        await ProductId.create([{ productId: 'known1' }, { productId: 'known2' }]);

        const insertManySpy = jest.spyOn(ProductId, 'insertMany');

        const productsListResponse = {
            data: {
                data: [
                    { id: 'known1', is_active: true, variants: [] },
                    { id: 'known2', is_active: true, variants: [] },
                ],
                version: { max: '' },
            },
        };
        const inventoryListResponse = {
            data: {
                data: [
                    { product_id: 'known1', inventory_level: 5 },
                    { product_id: 'known2', inventory_level: 5 },
                ],
                version: { max: '' },
            },
        };

        axios.get
            .mockResolvedValueOnce(productsListResponse)
            .mockResolvedValueOnce(inventoryListResponse)
            .mockResolvedValueOnce(makeProductApiResponse('known1'))
            .mockResolvedValueOnce(makeInventoryApiResponse(5))
            .mockResolvedValueOnce(makeProductApiResponse('known2'))
            .mockResolvedValueOnce(makeInventoryApiResponse(5));

        await updateProducts();

        expect(insertManySpy).not.toHaveBeenCalled();
        insertManySpy.mockRestore();
    });

    it('uses a single Product.find (not findOne per product) to check existence in storeProductDetails', async () => {
        const findSpy = jest.spyOn(Product, 'find');

        // Seed two existing products
        await Product.create([makeProductDoc('pa'), makeProductDoc('pb')]);

        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('pa'))
            .mockResolvedValueOnce(makeInventoryApiResponse(5))
            .mockResolvedValueOnce(makeProductApiResponse('pb'))
            .mockResolvedValueOnce(makeInventoryApiResponse(3));

        await storeProductDetails(['pa', 'pb']);

        // Exactly one Product.find call for the existence pre-fetch (with $in)
        const existenceCheckCalls = findSpy.mock.calls.filter(
            ([query]) => query?.['product.id']?.$in
        );
        expect(existenceCheckCalls).toHaveLength(1);
        expect(existenceCheckCalls[0][0]['product.id'].$in).toEqual(
            expect.arrayContaining(['pa', 'pb'])
        );

        findSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// storeProductDetails — upsert bulkWrite behaviour (Fix 2)
// ---------------------------------------------------------------------------

describe('storeProductDetails — upsert bulkWrite', () => {
    it('creates a new Product document when product ID does not exist', async () => {
        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('brand_new'))
            .mockResolvedValueOnce(makeInventoryApiResponse(8));

        const result = await storeProductDetails(['brand_new']);

        expect(result.storedCount).toBe(1);
        expect(result.updatedCount).toBe(0);

        const saved = await Product.findOne({ 'product.id': 'brand_new' }).lean();
        expect(saved).not.toBeNull();
        expect(saved.totalQty).toBe(8);
        expect(saved.webhook).toBe('cron');
        expect(saved.status).toBe(true);
    });

    it('updates an existing Product document without creating a duplicate', async () => {
        await Product.create(makeProductDoc('existing_prod', { totalQty: 5 }));

        // Lightspeed now returns qty=12 for the same product
        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('existing_prod'))
            .mockResolvedValueOnce(makeInventoryApiResponse(12));

        const result = await storeProductDetails(['existing_prod']);

        expect(result.storedCount).toBe(0);
        expect(result.updatedCount).toBe(1);

        // Exactly one document should exist
        const all = await Product.find({ 'product.id': 'existing_prod' }).lean();
        expect(all).toHaveLength(1);
        expect(all[0].totalQty).toBe(12);
    });

    it('correctly counts mixed new and existing products', async () => {
        await Product.create(makeProductDoc('old_prod'));

        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('old_prod'))
            .mockResolvedValueOnce(makeInventoryApiResponse(5))
            .mockResolvedValueOnce(makeProductApiResponse('new_prod'))
            .mockResolvedValueOnce(makeInventoryApiResponse(7));

        const result = await storeProductDetails(['old_prod', 'new_prod']);

        expect(result.storedCount).toBe(1);   // new_prod
        expect(result.updatedCount).toBe(1);  // old_prod
    });

    it('skips inactive products (fetchProductDetails returns null) without counting them', async () => {
        // is_active: false → fetchProductDetails returns null
        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('inactive_prod', { is_active: false }))
            .mockResolvedValueOnce(makeInventoryApiResponse(5)); // inventory still fetched before active check

        const result = await storeProductDetails(['inactive_prod']);

        expect(result.storedCount).toBe(0);
        expect(result.updatedCount).toBe(0);

        const saved = await Product.findOne({ 'product.id': 'inactive_prod' }).lean();
        expect(saved).toBeNull();
    });

    it('sets status=false when totalQty is 0', async () => {
        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('zero_stock'))
            .mockResolvedValueOnce(makeInventoryApiResponse(0)); // out of stock

        await storeProductDetails(['zero_stock']);

        const saved = await Product.findOne({ 'product.id': 'zero_stock' }).lean();
        // totalQty=0 → product not pushed to variantsData → totalQty stays 0
        expect(saved?.status ?? false).toBe(false);
    });

    it('fixes zero tax_inclusive by patching price from first variant price', async () => {
        // Product with zero parent price but variants with real prices
        const productWithZeroTax = makeProductApiResponse('zero_tax', {
            price_standard: { tax_inclusive: '0', tax_exclusive: '0' },
            variants: [
                {
                    id: 'vzt1',
                    name: 'Variant 1',
                    is_active: true,
                    price_standard: { tax_inclusive: '75.00' },
                    variant_definitions: [{ value: 'Blue' }],
                },
            ],
        });
        axios.get
            .mockResolvedValueOnce(productWithZeroTax)
            .mockResolvedValueOnce(makeInventoryApiResponse(5)); // vzt1 inventory

        await storeProductDetails(['zero_tax']);

        const saved = await Product.findOne({ 'product.id': 'zero_tax' }).lean();
        expect(saved).not.toBeNull();
        // price_standard.tax_inclusive should have been patched to the variant's price
        expect(parseFloat(saved.product.price_standard.tax_inclusive)).toBe(75);
    });

    it('continues processing remaining products when one Lightspeed API call fails', async () => {
        await Product.create(makeProductDoc('good_prod'));

        axios.get
            .mockRejectedValueOnce(new Error('Lightspeed 503'))  // bad_prod fails
            .mockResolvedValueOnce(makeProductApiResponse('good_prod')) // good_prod succeeds
            .mockResolvedValueOnce(makeInventoryApiResponse(4));

        const result = await storeProductDetails(['bad_prod', 'good_prod']);

        // bad_prod threw — skipped. good_prod was updated.
        expect(result.updatedCount).toBe(1);

        const good = await Product.findOne({ 'product.id': 'good_prod' }).lean();
        expect(good).not.toBeNull();
        expect(good.totalQty).toBe(4);
    });

    it('uses bulkWrite (not individual save/updateOne calls) for writes', async () => {
        const bulkWriteSpy = jest.spyOn(Product, 'bulkWrite');

        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('bw1'))
            .mockResolvedValueOnce(makeInventoryApiResponse(5))
            .mockResolvedValueOnce(makeProductApiResponse('bw2'))
            .mockResolvedValueOnce(makeInventoryApiResponse(3));

        await storeProductDetails(['bw1', 'bw2']);

        // Should have called bulkWrite exactly once (both ops in one batch)
        expect(bulkWriteSpy).toHaveBeenCalledTimes(1);
        const [ops] = bulkWriteSpy.mock.calls[0];
        expect(ops).toHaveLength(2);
        expect(ops[0].updateOne.update.$set['product.id']).toBeUndefined(); // $set has product object
        expect(ops[0].updateOne.upsert).toBe(true);
        expect(ops[1].updateOne.upsert).toBe(true);

        bulkWriteSpy.mockRestore();
    });

    it('handles an empty productIds array gracefully', async () => {
        const result = await storeProductDetails([]);

        expect(result.storedCount).toBe(0);
        expect(result.updatedCount).toBe(0);
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('returns { storedCount: 0, updatedCount: 0 } when all products fail', async () => {
        axios.get
            .mockRejectedValueOnce(new Error('timeout'))
            .mockRejectedValueOnce(new Error('timeout'));

        const result = await storeProductDetails(['fail1', 'fail2']);

        expect(result.storedCount).toBe(0);
        expect(result.updatedCount).toBe(0);
    });

    it('sets webhook=cron and a non-empty webhookTime on every upserted document', async () => {
        axios.get
            .mockResolvedValueOnce(makeProductApiResponse('wh_prod'))
            .mockResolvedValueOnce(makeInventoryApiResponse(3));

        await storeProductDetails(['wh_prod']);

        const saved = await Product.findOne({ 'product.id': 'wh_prod' }).lean();
        expect(saved.webhook).toBe('cron');
        expect(saved.webhookTime).toBeTruthy();
    });
});
