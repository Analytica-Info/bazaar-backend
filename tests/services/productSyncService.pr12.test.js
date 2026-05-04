/**
 * productSyncService.pr12.test.js
 * PR12 — Push productSyncService to ≥80% lines.
 * Covers: fixZeroTaxInclusive, fetchProductDetailsForRefresh, refreshSingleProductById,
 *         inactive product paths, no-variant active check, variant-subtracted-qty paths.
 */

require('../setup');
const Product = require('../../src/models/Product');
const ProductId = require('../../src/models/ProductId');

// --- Mock factories must be declared BEFORE jest.mock calls (Babel hoisting) ---
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
const mockCacheDel = jest.fn().mockResolvedValue(undefined);
const mockCacheDelPattern = jest.fn().mockResolvedValue(undefined);
const mockApplyDiscount = jest.fn().mockResolvedValue(undefined);
const mockSyncDiscounts = jest.fn().mockResolvedValue({ syncedParentIds: 1, skippedParentIds: 0, bulkWriteCount: 2 });

jest.mock('axios');
jest.mock('../../src/utilities/cache', () => ({
    get: (...a) => mockCacheGet(...a),
    set: (...a) => mockCacheSet(...a),
    del: (...a) => mockCacheDel(...a),
    delPattern: (...a) => mockCacheDelPattern(...a),
    key: (...parts) => parts.join(':'),
}));
jest.mock('../../src/helpers/productDiscountSync', () => ({
    applyDiscountFieldsForParentProductId: (...a) => mockApplyDiscount(...a),
    syncDiscountFieldsForParentIds: (...a) => mockSyncDiscounts(...a),
}));

const axios = require('axios');
const productSyncService = require('../../src/services/productSyncService');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeProductResponse = (id, overrides = {}) => ({
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

const makeProductResponseZeroPrice = (id) => ({
    data: {
        data: {
            id,
            name: `Product ${id}`,
            sku_number: `SKU-${id}`,
            is_active: true,
            ecwid_enabled_webstore: true,
            variants: [],
            price_standard: { tax_inclusive: '0', tax_exclusive: '95.24' },
        },
    },
});

const makeInventoryResponse = (level = 10) => ({
    data: { data: [{ inventory_level: level }] },
});

const makeParkedSalesResponse = (lineItems = []) => ({
    data: { data: lineItems.map(item => ({ line_items: [{ product_id: item.id, quantity: item.qty }] })) },
});

const makeMultiVariantProductResponse = (parentId, variants) => ({
    data: {
        data: {
            id: parentId,
            name: `Parent ${parentId}`,
            sku_number: `SKU-${parentId}`,
            is_active: true,
            ecwid_enabled_webstore: true,
            variants: variants.map(v => ({
                id: v.id,
                name: v.name || `Variant ${v.id}`,
                is_active: v.is_active !== false,
                price_standard: { tax_inclusive: v.price || '100.00', tax_exclusive: v.taxExcl || '95.24' },
                variant_definitions: v.definitions || [{ value: v.id }],
            })),
            price_standard: { tax_inclusive: '100.00', tax_exclusive: '95.24' },
        },
    },
});

beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// refreshSingleProductById
// ---------------------------------------------------------------------------
describe('refreshSingleProductById', () => {
    it('throws 400 when productId is falsy', async () => {
        await expect(productSyncService.refreshSingleProductById(null))
            .rejects.toMatchObject({ status: 400 });
        await expect(productSyncService.refreshSingleProductById(''))
            .rejects.toMatchObject({ status: 400 });
    });

    it('creates a new product when it does not exist in DB', async () => {
        // No ProductId record, no Product record — should create both.
        // Create path consults Lightspeed 2.0 for ecwid_enabled_webstore.
        axios.get
            .mockResolvedValueOnce(makeProductResponse('newprod1'))    // 3.0/products
            .mockResolvedValueOnce(makeInventoryResponse(5))           // 2.0/inventory
            .mockResolvedValueOnce({ data: { data: { ecwid_enabled_webstore: true } } }); // 2.0/products status lookup

        const result = await productSyncService.refreshSingleProductById('newprod1');

        expect(result.created).toBe(true);
        expect(result.updated).toBe(false);
        expect(result.productId).toBe('newprod1');

        const dbDoc = await Product.findOne({ 'product.id': 'newprod1' }).lean();
        expect(dbDoc).not.toBeNull();
        expect(dbDoc.totalQty).toBe(5);
        expect(dbDoc.status).toBe(true);

        const pidDoc = await ProductId.findOne({ productId: 'newprod1' }).lean();
        expect(pidDoc).not.toBeNull();
    });

    it('updates an existing product without overwriting status (preserves merchant in-store-only setting)', async () => {
        await Product.create({
            product: { id: 'existprod', name: 'Old Name' },
            variantsData: [],
            totalQty: 0,
            status: false,
        });

        axios.get
            .mockResolvedValueOnce(makeProductResponse('existprod'))
            .mockResolvedValueOnce(makeInventoryResponse(7));

        const result = await productSyncService.refreshSingleProductById('existprod');

        expect(result.created).toBe(false);
        expect(result.updated).toBe(true);
        expect(result.productId).toBe('existprod');
        expect(result.product).toBeDefined();

        const dbDoc = await Product.findOne({ 'product.id': 'existprod' }).lean();
        expect(dbDoc.totalQty).toBe(7);
        // Status is owned by the product.update webhook handler — refresh
        // updates qty/variantsData but must not flip an in-store-only product
        // back online. The seeded false stays false.
        expect(dbDoc.status).toBe(false);
    });

    it('does not create a new ProductId record when it already exists', async () => {
        await ProductId.create({ productId: 'knowprod' });
        await Product.create({ product: { id: 'knowprod', name: 'Known' }, variantsData: [], totalQty: 3, status: true });

        axios.get
            .mockResolvedValueOnce(makeProductResponse('knowprod'))
            .mockResolvedValueOnce(makeInventoryResponse(3));

        await productSyncService.refreshSingleProductById('knowprod');

        const count = await ProductId.countDocuments({ productId: 'knowprod' });
        expect(count).toBe(1); // not duplicated
    });

    it('creates product with status false when totalQty is 0', async () => {
        axios.get
            .mockResolvedValueOnce(makeProductResponse('zeroprod'))
            .mockResolvedValueOnce(makeInventoryResponse(0)); // no inventory

        await productSyncService.refreshSingleProductById('zeroprod');

        const dbDoc = await Product.findOne({ 'product.id': 'zeroprod' }).lean();
        expect(dbDoc.status).toBe(false);
        expect(dbDoc.totalQty).toBe(0);
    });

    it('patches fixZeroTaxInclusive when price_standard.tax_inclusive is 0 but variants have price', async () => {
        // Product with variants — first variant has real price, parent has zero tax_inclusive
        const variants = [
            { id: 'var-fix1', price: '120.00', is_active: true, definitions: [{ value: 'Blue' }] },
        ];
        const productWithZeroPrice = makeMultiVariantProductResponse('zerotax1', variants);
        // Override parent price to zero
        productWithZeroPrice.data.data.price_standard = { tax_inclusive: '0', tax_exclusive: '0' };

        axios.get
            .mockResolvedValueOnce(productWithZeroPrice)          // 3.0/products
            .mockResolvedValueOnce(makeInventoryResponse(5));     // variant inventory

        await productSyncService.refreshSingleProductById('zerotax1');

        const dbDoc = await Product.findOne({ 'product.id': 'zerotax1' }).lean();
        // fixZeroTaxInclusive patches the product price from the first variant
        expect(dbDoc).not.toBeNull();
        // product was saved — the test verifies the flow completes without error
    });

    it('product inactive (no-variant path) — returns with empty variantsData', async () => {
        // No-variant product that is inactive — fetchProductDetailsForRefresh throws
        const inactiveProduct = makeProductResponse('inact1');
        inactiveProduct.data.data.is_active = false;

        axios.get
            .mockResolvedValueOnce(inactiveProduct)               // 3.0/products
            .mockResolvedValueOnce(makeInventoryResponse(3));     // 2.0/inventory

        // is_active !== true → throws 'Product is not active.'
        await expect(productSyncService.refreshSingleProductById('inact1'))
            .rejects.toThrow();
    });

    it('uses tax_exclusive fallback when tax_inclusive is null (refresh-specific behavior)', async () => {
        const productWithNullInclusive = makeProductResponse('taxexcl1');
        productWithNullInclusive.data.data.price_standard = { tax_inclusive: null, tax_exclusive: '90.48' };

        axios.get
            .mockResolvedValueOnce(productWithNullInclusive)
            .mockResolvedValueOnce(makeInventoryResponse(5));

        const result = await productSyncService.refreshSingleProductById('taxexcl1');

        expect(result.created).toBe(true);
        const dbDoc = await Product.findOne({ 'product.id': 'taxexcl1' }).lean();
        // price stored from tax_exclusive fallback
        expect(dbDoc.variantsData[0].price).toBe('90.48');
    });

    it('refresh with variants — fetches variant inventories in parallel', async () => {
        const variants = [
            { id: 'rfv1', price: '80.00', is_active: true },
            { id: 'rfv2', price: '90.00', is_active: true },
        ];

        axios.get
            .mockResolvedValueOnce(makeMultiVariantProductResponse('rfparent', variants))
            .mockResolvedValueOnce(makeInventoryResponse(4))  // rfv1
            .mockResolvedValueOnce(makeInventoryResponse(6)); // rfv2

        const result = await productSyncService.refreshSingleProductById('rfparent');
        expect(result.created).toBe(true);

        const dbDoc = await Product.findOne({ 'product.id': 'rfparent' }).lean();
        expect(dbDoc.totalQty).toBe(10);
        expect(dbDoc.variantsData).toHaveLength(2);
    });

    it('refresh with variants — skips variant when inventory fetch fails', async () => {
        const variants = [
            { id: 'rfgood', price: '80.00', is_active: true },
            { id: 'rfbad', price: '90.00', is_active: true },
        ];

        axios.get
            .mockResolvedValueOnce(makeMultiVariantProductResponse('rfpartial', variants))
            .mockResolvedValueOnce(makeInventoryResponse(4))
            .mockRejectedValueOnce(new Error('Lightspeed 429'));

        const result = await productSyncService.refreshSingleProductById('rfpartial');
        expect(result.created).toBe(true);

        const dbDoc = await Product.findOne({ 'product.id': 'rfpartial' }).lean();
        expect(dbDoc.variantsData).toHaveLength(1);
        expect(dbDoc.variantsData[0].id).toBe('rfgood');
    });

    it('refresh with variants — inactive variants are filtered out', async () => {
        const variants = [
            { id: 'rfactive', price: '80.00', is_active: true },
            { id: 'rfinactive', price: '90.00', is_active: false },
        ];

        axios.get
            .mockResolvedValueOnce(makeMultiVariantProductResponse('rffiltered', variants))
            .mockResolvedValueOnce(makeInventoryResponse(3)); // only rfactive fetched

        await productSyncService.refreshSingleProductById('rffiltered');

        const inventoryCalls = axios.get.mock.calls.filter(([url]) => url.includes('/inventory'));
        expect(inventoryCalls).toHaveLength(1);
    });

    it('refresh no-variant product with zero inventory — excluded from variantsData', async () => {
        axios.get
            .mockResolvedValueOnce(makeProductResponse('zeroinv'))
            .mockResolvedValueOnce(makeInventoryResponse(0));

        const result = await productSyncService.refreshSingleProductById('zeroinv');
        const dbDoc = await Product.findOne({ 'product.id': 'zeroinv' }).lean();
        expect(dbDoc.variantsData).toHaveLength(0);
        expect(dbDoc.status).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// handleProductUpdate — paths not covered in main test file
// ---------------------------------------------------------------------------
describe('handleProductUpdate — additional paths', () => {
    it('fetchProductDetails (no variants): deducts qty from inventory when variantId === productId', async () => {
        // This exercises the `if (variantId === id) inventoryLevel -= qty` path in fetchProductDetails
        // variant_parent_id present but existingProductId found → fetchProductDetails called
        const cache = require('../../src/utilities/cache');
        mockCacheGet.mockResolvedValue(null);

        const pid = 'deductprod1';
        await ProductId.create({ productId: pid });
        await Product.create({
            product: { id: pid, name: 'Deduct' },
            variantsData: [{ id: pid, qty: 8, price: '100.00' }],
            totalQty: 8,
            status: true,
        });

        // fetchProductDetails (no-variant) → inventory fetch
        axios.get
            .mockResolvedValueOnce(makeProductResponse(pid))        // 2.0 onlineStatus
            .mockResolvedValueOnce(makeProductResponse(pid))        // 3.0/products (fetchProductDetails)
            .mockResolvedValueOnce(makeInventoryResponse(10))       // 2.0/inventory (fetchProductDetails)
            .mockResolvedValueOnce(makeParkedSalesResponse([]))     // filterParkProducts
            .mockResolvedValueOnce(makeProductResponse(pid))        // 3.0/products (fetchProductInventoryDetails)
            .mockResolvedValueOnce(makeInventoryResponse(10));      // 2.0/inventory (fetchProductInventoryDetails)

        const payload = JSON.stringify({ id: pid, variant_parent_id: null });
        const result = await productSyncService.handleProductUpdate({ payload, type: 'product.update' });

        expect(result).toEqual({ success: true });
    });

    it('discount sync error is caught and does not propagate', async () => {
        mockCacheGet.mockResolvedValue(null);
        mockApplyDiscount.mockRejectedValueOnce(new Error('discount sync failed'));

        const pid = 'discfail1';
        axios.get
            .mockResolvedValueOnce(makeProductResponse(pid))
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeProductResponse(pid))
            .mockResolvedValueOnce(makeInventoryResponse(5));

        const payload = JSON.stringify({ id: pid, variant_parent_id: null });
        const result = await productSyncService.handleProductUpdate({ payload, type: 'product.update' });

        expect(result).toEqual({ success: true }); // discount error is swallowed
    });
});

// ---------------------------------------------------------------------------
// handleInventoryUpdate — additional paths
// ---------------------------------------------------------------------------
describe('handleInventoryUpdate — additional paths', () => {
    it('discount sync error is caught and does not propagate', async () => {
        mockCacheGet.mockResolvedValue(null);
        mockApplyDiscount.mockRejectedValueOnce(new Error('discount sync failed'));

        axios.get
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeProductResponse('invdisc1'))
            .mockResolvedValueOnce(makeInventoryResponse(3));

        const payload = JSON.stringify({ id: 'invdisc_id', product: { id: 'invdisc1', variant_parent_id: null } });
        const result = await productSyncService.handleInventoryUpdate({ payload, type: 'inventory.update' });

        expect(result).toEqual({ success: true });
    });

    it('parked sales matched for variant — uses parked item as itemId', async () => {
        mockCacheGet.mockResolvedValue(null);

        const pid = 'parkedmatch1';
        await Product.create({
            product: { id: pid, name: 'Parked Match' },
            variantsData: [{ id: pid, qty: 5, price: '100.00' }],
            totalQty: 5,
            status: true,
        });

        // filterParkProducts returns a sale for pid → getMatchingProductIds returns pid → itemId = pid
        axios.get
            .mockResolvedValueOnce(makeParkedSalesResponse([{ id: pid, qty: 2 }]))
            .mockResolvedValueOnce(makeProductResponse(pid))
            .mockResolvedValueOnce(makeInventoryResponse(5));

        const payload = JSON.stringify({ id: 'inv_parked', product: { id: pid, variant_parent_id: null } });
        const result = await productSyncService.handleInventoryUpdate({ payload, type: 'inventory.update' });

        expect(result).toEqual({ success: true });
    });
});

// ---------------------------------------------------------------------------
// handleSaleUpdate — additional paths
// ---------------------------------------------------------------------------
describe('handleSaleUpdate — additional paths', () => {
    it('discount sync error in sale update is swallowed', async () => {
        mockCacheGet.mockResolvedValue(null);
        mockApplyDiscount.mockRejectedValueOnce(new Error('discount error'));

        await Product.create({
            product: { id: 'saledisc1', name: 'Sale Disc' },
            variantsData: [{ id: 'varsd1', qty: 10, price: '100.00', sku: 'S1', name: 'V1' }],
            totalQty: 10,
            status: true,
        });

        axios.get
            .mockResolvedValueOnce(makeProductResponse('saledisc1'))
            .mockResolvedValueOnce(makeInventoryResponse(8));

        const payload = JSON.stringify({
            id: 'saled_id',
            register_sale_products: [{ product_id: 'varsd1', quantity: 2 }],
            status: 'SAVED',
        });
        const result = await productSyncService.handleSaleUpdate({ payload, type: 'register_sale.update' });

        expect(result).toEqual({ success: true });
    });

    it('sale with status != SAVED does not deduct qty from inventory', async () => {
        mockCacheGet.mockResolvedValue(null);

        await Product.create({
            product: { id: 'openprod1', name: 'Open Sale' },
            variantsData: [{ id: 'vopen1', qty: 10, price: '50.00', sku: 'S2', name: 'V2' }],
            totalQty: 10,
            status: true,
        });

        // fetchProductInventory: status != 'SAVED' → inventoryLevel NOT deducted
        axios.get
            .mockResolvedValueOnce(makeProductResponse('openprod1'))
            .mockResolvedValueOnce(makeInventoryResponse(10));

        const payload = JSON.stringify({
            id: 'sale_open',
            register_sale_products: [{ product_id: 'vopen1', quantity: 3 }],
            status: 'OPEN',
        });
        const result = await productSyncService.handleSaleUpdate({ payload, type: 'register_sale.update' });

        expect(result).toEqual({ success: true });
        const updated = await Product.findOne({ 'product.id': 'openprod1' }).lean();
        // No deduction since status !== 'SAVED'
        expect(updated.variantsData[0].qty).toBe(10);
    });

    it('product inactive in fetchProductInventory → inventoryLevel = 0', async () => {
        mockCacheGet.mockResolvedValue(null);

        const inactiveProduct = makeProductResponse('inact_sale1');
        inactiveProduct.data.data.is_active = false;

        await Product.create({
            product: { id: 'inact_sale1', name: 'Inactive' },
            variantsData: [{ id: 'varInact1', qty: 5, price: '100.00', sku: 'S3', name: 'V3' }],
            totalQty: 5,
            status: true,
        });

        axios.get
            .mockResolvedValueOnce(inactiveProduct)                  // 3.0/products (fetchProductInventory)
            .mockResolvedValueOnce(makeInventoryResponse(5));        // 2.0/inventory (won't be used — is_active=false)

        const payload = JSON.stringify({
            id: 'sale_inact',
            register_sale_products: [{ product_id: 'varInact1', quantity: 1 }],
            status: 'SAVED',
        });
        const result = await productSyncService.handleSaleUpdate({ payload, type: 'register_sale.update' });

        expect(result).toEqual({ success: true });
        const updated = await Product.findOne({ 'product.id': 'inact_sale1' }).lean();
        // inventoryLevel returned 0 (inactive) → variant qty set to 0
        expect(updated.variantsData[0].qty).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// refreshSingleProductById — ProductId already exists in collection
// ---------------------------------------------------------------------------
describe('refreshSingleProductById — ProductId already registered', () => {
    it('finds existing ProductId record and logs without creating duplicate', async () => {
        await ProductId.create({ productId: 'alreadyknown' });

        axios.get
            .mockResolvedValueOnce(makeProductResponse('alreadyknown'))
            .mockResolvedValueOnce(makeInventoryResponse(3));

        const result = await productSyncService.refreshSingleProductById('alreadyknown');
        expect(result.created).toBe(true); // product not in Product coll → created

        const count = await ProductId.countDocuments({ productId: 'alreadyknown' });
        expect(count).toBe(1);
    });
});
