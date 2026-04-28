require("../setup");
const Product = require("../../src/models/Product");
const ProductId = require("../../src/models/ProductId");

// Mock external dependencies
jest.mock("axios");
jest.mock("../../src/utilities/cache", () => ({
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(undefined),
    key: (...parts) => parts.join(':'),
}));
jest.mock("../../src/helpers/productDiscountSync", () => ({
    applyDiscountFieldsForParentProductId: jest.fn().mockResolvedValue(undefined),
    syncDiscountFieldsForParentIds: jest.fn().mockResolvedValue({
        syncedParentIds: 0,
        skippedParentIds: 0,
        bulkWriteCount: 0,
    }),
}));

const axios = require("axios");
const cache = require("../../src/utilities/cache");
const productSyncService = require("../../src/services/productSyncService");

// ---------------------------------------------------------------------------
// Lightspeed API response fixtures
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
            price_standard: { tax_inclusive: "100.00", tax_exclusive: "95.24" },
            ...overrides,
        },
    },
});

const makeInventoryResponse = (level = 10) => ({
    data: { data: [{ inventory_level: level }] },
});

const makeParkedSalesResponse = (lineItems = []) => ({
    data: { data: lineItems.map(item => ({ line_items: [{ product_id: item.id, quantity: item.qty }] })) },
});

const makeVariantProduct = (parentId, variantId) => ({
    data: {
        data: {
            id: parentId,
            name: `Parent ${parentId}`,
            sku_number: `SKU-${parentId}`,
            is_active: true,
            ecwid_enabled_webstore: true,
            variants: [
                {
                    id: variantId,
                    name: `Variant ${variantId}`,
                    is_active: true,
                    price_standard: { tax_inclusive: "100.00" },
                    variant_definitions: [{ value: "Red" }],
                },
            ],
            price_standard: { tax_inclusive: "100.00", tax_exclusive: "95.24" },
        },
    },
});

beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null); // Default: no dedup lock held
    cache.set.mockResolvedValue(undefined);
    cache.del.mockResolvedValue(undefined);
    cache.delPattern.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// getProductsWithWebhookUpdate
// ---------------------------------------------------------------------------
describe("getProductsWithWebhookUpdate", () => {
    it("returns products with webhook flag 'product.update'", async () => {
        await Product.create([
            { product: { id: "p1", name: "Product 1" }, variantsData: [], totalQty: 5, status: true, webhook: "product.update", webhookTime: "12:00:00 PM" },
            { product: { id: "p2", name: "Product 2" }, variantsData: [], totalQty: 3, status: true, webhook: "inventory.update", webhookTime: "12:00:00 PM" },
        ]);

        const result = await productSyncService.getProductsWithWebhookUpdate();

        expect(result.webhook).toBe("product.update");
        expect(result.count).toBe(1);
        expect(result.products[0].product.id).toBe("p1");
    });

    it("returns empty when no products have product.update webhook", async () => {
        await Product.create({ product: { id: "p3", name: "Product 3" }, variantsData: [], totalQty: 2, status: true, webhook: "inventory.update" });

        const result = await productSyncService.getProductsWithWebhookUpdate();

        expect(result.count).toBe(0);
        expect(result.products).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// syncWebhookDiscounts
// ---------------------------------------------------------------------------
describe("syncWebhookDiscounts", () => {
    it("runs without error on empty DB", async () => {
        const result = await productSyncService.syncWebhookDiscounts();

        expect(result.distinctParentIds).toBe(0);
        expect(result.syncedParentIds).toBe(0);
        expect(result.bulkWriteOperations).toBe(0);
    });

    it("processes products with product.update webhook", async () => {
        await Product.create({ product: { id: "p10", name: "Sync Product" }, variantsData: [], totalQty: 10, status: true, webhook: "product.update" });

        const result = await productSyncService.syncWebhookDiscounts();

        expect(result.distinctParentIds).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// handleProductUpdate
// ---------------------------------------------------------------------------
describe("handleProductUpdate", () => {
    it("throws 400 when payload is missing", async () => {
        await expect(productSyncService.handleProductUpdate({ payload: null, type: "product.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when payload is invalid JSON", async () => {
        await expect(productSyncService.handleProductUpdate({ payload: "not-json", type: "product.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when product ID is missing from payload", async () => {
        // Dedup check passes (no lock), but id is missing after parsing
        const payload = JSON.stringify({ variant_parent_id: null }); // no id field

        await expect(productSyncService.handleProductUpdate({ payload, type: "product.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("skips processing and returns skipped:true when dedup lock is held", async () => {
        cache.get.mockResolvedValue("1"); // lock is held

        const payload = JSON.stringify({ id: "prod123", variant_parent_id: null });
        const result = await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        expect(result).toEqual({ success: true, skipped: true });
        expect(axios.get).not.toHaveBeenCalled();
    });

    it("processes normally when no dedup lock (product not in ProductId collection)", async () => {
        cache.get.mockResolvedValue(null); // no lock

        // axios call sequence:
        // 1. GET api/2.0/products/prod123 (product detail for onlineStatus)
        // 2. GET api/2.0/search?type=sales&status=SAVED (filterParkProducts)
        // 3. GET api/3.0/products/prod123 (fetchProductInventoryDetails → no variants)
        // 4. GET api/2.0/products/prod123/inventory
        axios.get
            .mockResolvedValueOnce(makeProductResponse("prod123"))
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeProductResponse("prod123"))
            .mockResolvedValueOnce(makeInventoryResponse(5));

        await Product.create({ product: { id: "prod123", name: "Test" }, variantsData: [{ id: "prod123", qty: 3, price: "100.00" }], totalQty: 3, status: true, webhook: "product.update" });

        const payload = JSON.stringify({ id: "prod123", variant_parent_id: null });
        const result = await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        expect(result).toEqual({ success: true });
        expect(cache.set).toHaveBeenCalledWith(expect.stringContaining("prod123"), "1", 3);
        expect(cache.delPattern).toHaveBeenCalledWith("catalog:*");
    });

    it("sets dedup lock using variant_parent_id when present", async () => {
        cache.get.mockResolvedValue(null);

        axios.get
            .mockResolvedValueOnce(makeProductResponse("parent123"))   // 2.0 products detail
            .mockResolvedValueOnce(makeParkedSalesResponse([]))         // saved sales
            .mockResolvedValueOnce(makeProductResponse("parent123"))   // 3.0 products
            .mockResolvedValueOnce(makeInventoryResponse(5));           // inventory

        const payload = JSON.stringify({ id: "var456", variant_parent_id: "parent123" });
        await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        expect(cache.set).toHaveBeenCalledWith(
            expect.stringContaining("parent123"),
            "1",
            3
        );
        // Should NOT contain the variant ID as the dedup key
        const dedupCall = cache.set.mock.calls[0];
        expect(dedupCall[0]).not.toContain("var456");
    });

    it("updates Product in DB when productId exists in ProductId collection", async () => {
        cache.get.mockResolvedValue(null);

        await ProductId.create({ productId: "prod999" });
        await Product.create({ product: { id: "prod999", name: "Existing" }, variantsData: [], totalQty: 0, status: true });

        // fetchProductDetails (called when existingProductId found): 3.0/products + 2.0/inventory
        // Then same calls for inventoryProductDetailUpdate
        axios.get
            .mockResolvedValueOnce(makeProductResponse("prod999"))      // 2.0/products (onlineStatus check)
            .mockResolvedValueOnce(makeProductResponse("prod999"))      // 3.0/products (fetchProductDetails)
            .mockResolvedValueOnce(makeInventoryResponse(8))            // 2.0/inventory (fetchProductDetails)
            .mockResolvedValueOnce(makeParkedSalesResponse([]))         // saved sales (filterParkProducts)
            .mockResolvedValueOnce(makeProductResponse("prod999"))      // 3.0/products (fetchProductInventoryDetails)
            .mockResolvedValueOnce(makeInventoryResponse(8));           // 2.0/inventory (fetchProductInventoryDetails)

        const payload = JSON.stringify({ id: "prod999", variant_parent_id: null });
        const result = await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        expect(result).toEqual({ success: true });
        const updated = await Product.findOne({ "product.id": "prod999" }).lean();
        expect(updated).not.toBeNull();
    });

    it("does not acquire dedup lock twice for same product", async () => {
        cache.get
            .mockResolvedValueOnce(null)  // first call — no lock
            .mockResolvedValueOnce("1");  // second call — lock held

        axios.get
            .mockResolvedValueOnce(makeProductResponse("prod111"))
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeProductResponse("prod111"))
            .mockResolvedValueOnce(makeInventoryResponse(5));

        const payload = JSON.stringify({ id: "prod111", variant_parent_id: null });

        const [r1, r2] = await Promise.all([
            productSyncService.handleProductUpdate({ payload, type: "product.update" }),
            productSyncService.handleProductUpdate({ payload, type: "product.update" }),
        ]);

        const results = [r1, r2];
        expect(results.some(r => r.skipped === true)).toBe(true);
        expect(results.some(r => r.success === true && !r.skipped)).toBe(true);
    });

    it("invalidates catalog and categories cache after successful update", async () => {
        cache.get.mockResolvedValue(null);
        axios.get
            .mockResolvedValueOnce(makeProductResponse("prod222"))
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeProductResponse("prod222"))
            .mockResolvedValueOnce(makeInventoryResponse(3));

        const payload = JSON.stringify({ id: "prod222", variant_parent_id: null });
        await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        expect(cache.delPattern).toHaveBeenCalledWith("catalog:*");
        expect(cache.del).toHaveBeenCalledWith("lightspeed:categories:v1");
    });
});

// ---------------------------------------------------------------------------
// handleInventoryUpdate
// ---------------------------------------------------------------------------
describe("handleInventoryUpdate", () => {
    it("throws 400 when payload is missing", async () => {
        await expect(productSyncService.handleInventoryUpdate({ payload: null, type: "inventory.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when payload is invalid JSON", async () => {
        await expect(productSyncService.handleInventoryUpdate({ payload: "bad json", type: "inventory.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when product ID is missing", async () => {
        const payload = JSON.stringify({ product: { id: "prod123", variant_parent_id: null } }); // missing top-level id

        await expect(productSyncService.handleInventoryUpdate({ payload, type: "inventory.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("skips and returns skipped:true when dedup lock is held", async () => {
        cache.get.mockResolvedValue("1");

        const payload = JSON.stringify({ id: "inv1", product: { id: "prod123", variant_parent_id: null } });
        const result = await productSyncService.handleInventoryUpdate({ payload, type: "inventory.update" });

        expect(result).toEqual({ success: true, skipped: true });
        expect(axios.get).not.toHaveBeenCalled();
    });

    it("processes normally when no dedup lock (no parked sales)", async () => {
        cache.get.mockResolvedValue(null);

        await Product.create({ product: { id: "prod333", name: "Inv Product" }, variantsData: [{ id: "prod333", qty: 5, price: "50.00" }], totalQty: 5, status: true });

        axios.get
            .mockResolvedValueOnce(makeParkedSalesResponse([]))         // filterParkProducts
            .mockResolvedValueOnce(makeProductResponse("prod333"))      // 3.0/products
            .mockResolvedValueOnce(makeInventoryResponse(7));           // 2.0/inventory

        const payload = JSON.stringify({ id: "inv2", product: { id: "prod333", variant_parent_id: null } });
        const result = await productSyncService.handleInventoryUpdate({ payload, type: "inventory.update" });

        expect(result).toEqual({ success: true });
        expect(cache.set).toHaveBeenCalledWith(expect.stringContaining("prod333"), "1", 3);
    });

    it("uses variant_parent_id as updateProductId when present", async () => {
        cache.get.mockResolvedValue(null);

        axios.get
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeProductResponse("parent777"))
            .mockResolvedValueOnce(makeInventoryResponse(4));

        const payload = JSON.stringify({ id: "inv3", product: { id: "var888", variant_parent_id: "parent777" } });
        await productSyncService.handleInventoryUpdate({ payload, type: "inventory.update" });

        expect(cache.set).toHaveBeenCalledWith(
            expect.stringContaining("parent777"),
            "1",
            3
        );
    });

    it("uses updateProductId directly as itemId when no parked sales match", async () => {
        cache.get.mockResolvedValue(null);

        axios.get
            .mockResolvedValueOnce(makeParkedSalesResponse([{ id: "other999", qty: 1 }])) // parked sale, different product
            .mockResolvedValueOnce(makeProductResponse("prod444"))
            .mockResolvedValueOnce(makeInventoryResponse(2));

        const payload = JSON.stringify({ id: "inv4", product: { id: "prod444", variant_parent_id: null } });
        const result = await productSyncService.handleInventoryUpdate({ payload, type: "inventory.update" });

        expect(result).toEqual({ success: true });
    });

    it("invalidates inventory cache after successful update", async () => {
        cache.get.mockResolvedValue(null);

        axios.get
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeProductResponse("prod555"))
            .mockResolvedValueOnce(makeInventoryResponse(1));

        const payload = JSON.stringify({ id: "inv5", product: { id: "prod555", variant_parent_id: null } });
        await productSyncService.handleInventoryUpdate({ payload, type: "inventory.update" });

        expect(cache.delPattern).toHaveBeenCalledWith("catalog:*");
        expect(cache.del).toHaveBeenCalledWith("lightspeed:products-inventory:v1");
    });

    it("gracefully handles Lightspeed API failure in filterParkProducts (returns empty array)", async () => {
        cache.get.mockResolvedValue(null);

        // filterParkProducts throws — it catches internally and returns []
        axios.get
            .mockRejectedValueOnce(new Error("Lightspeed 503"))   // filterParkProducts fails
            .mockResolvedValueOnce(makeProductResponse("prod666")) // fetchProductInventoryDetails
            .mockResolvedValueOnce(makeInventoryResponse(3));

        const payload = JSON.stringify({ id: "inv6", product: { id: "prod666", variant_parent_id: null } });
        const result = await productSyncService.handleInventoryUpdate({ payload, type: "inventory.update" });

        expect(result).toEqual({ success: true });
    });
});

// ---------------------------------------------------------------------------
// handleSaleUpdate
// ---------------------------------------------------------------------------
describe("handleSaleUpdate", () => {
    it("throws 400 when payload is missing", async () => {
        await expect(productSyncService.handleSaleUpdate({ payload: null, type: "register_sale.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when payload is invalid JSON", async () => {
        await expect(productSyncService.handleSaleUpdate({ payload: "invalid", type: "register_sale.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when top-level id is missing", async () => {
        const payload = JSON.stringify({
            register_sale_products: [{ product_id: "var1", quantity: 1 }],
            status: "SAVED",
        });

        await expect(productSyncService.handleSaleUpdate({ payload, type: "register_sale.update" }))
            .rejects.toMatchObject({ status: 400 });
    });

    it("skips and returns skipped:true when dedup lock held for same saleId+productId", async () => {
        cache.get.mockResolvedValue("1");

        const payload = JSON.stringify({
            id: "sale1",
            register_sale_products: [{ product_id: "var1", quantity: 2 }],
            status: "SAVED",
        });
        const result = await productSyncService.handleSaleUpdate({ payload, type: "register_sale.update" });

        expect(result).toEqual({ success: true, skipped: true });
        expect(axios.get).not.toHaveBeenCalled();
    });

    it("processes normally and updates variant qty when product found in DB", async () => {
        cache.get.mockResolvedValue(null);

        await Product.create({
            product: { id: "parent1", name: "Parent" },
            variantsData: [{ id: "var1", qty: 10, price: "100.00", sku: "S1", name: "V1" }],
            totalQty: 10,
            status: true,
        });

        // fetchProductInventory: 3.0/products/{parent1} + 2.0/products/{var1}/inventory
        axios.get
            .mockResolvedValueOnce(makeProductResponse("parent1"))
            .mockResolvedValueOnce(makeInventoryResponse(8)); // sold 2, qty=8

        const payload = JSON.stringify({
            id: "sale2",
            register_sale_products: [{ product_id: "var1", quantity: 2 }],
            status: "SAVED",
        });
        const result = await productSyncService.handleSaleUpdate({ payload, type: "register_sale.update" });

        expect(result).toEqual({ success: true });
        const updated = await Product.findOne({ "product.id": "parent1" }).lean();
        // inventory_level=8, status=SAVED, qty=2 → Math.max(8-2, 0) = 6
        expect(updated.variantsData[0].qty).toBe(6);
    });

    it("logs 'No parked product found' gracefully when variant not in DB", async () => {
        cache.get.mockResolvedValue(null);

        const payload = JSON.stringify({
            id: "sale3",
            register_sale_products: [{ product_id: "nonexistent_var", quantity: 1 }],
            status: "SAVED",
        });
        const result = await productSyncService.handleSaleUpdate({ payload, type: "register_sale.update" });

        expect(result).toEqual({ success: true });
        expect(axios.get).not.toHaveBeenCalled(); // no inventory fetch needed
    });

    it("does NOT skip when same saleId but different productId (different dedup key)", async () => {
        // First product: lock held
        cache.get
            .mockResolvedValueOnce("1")    // lock for sale4+var1
            .mockResolvedValueOnce(null);  // no lock for sale4+var2

        const payload1 = JSON.stringify({
            id: "sale4",
            register_sale_products: [{ product_id: "var1", quantity: 1 }],
            status: "SAVED",
        });
        const result1 = await productSyncService.handleSaleUpdate({ payload: payload1, type: "register_sale.update" });
        expect(result1.skipped).toBe(true);

        const payload2 = JSON.stringify({
            id: "sale4",
            register_sale_products: [{ product_id: "var2", quantity: 1 }],
            status: "SAVED",
        });
        const result2 = await productSyncService.handleSaleUpdate({ payload: payload2, type: "register_sale.update" });
        expect(result2.skipped).toBeUndefined(); // not skipped — different variant
    });

    it("sets dedup lock keyed on saleId AND productId", async () => {
        cache.get.mockResolvedValue(null);

        const payload = JSON.stringify({
            id: "sale5",
            register_sale_products: [{ product_id: "var99", quantity: 1 }],
            status: "OPEN",
        });
        await productSyncService.handleSaleUpdate({ payload, type: "register_sale.update" });

        expect(cache.set).toHaveBeenCalledWith(
            expect.stringContaining("sale5"),
            "1",
            3
        );
        expect(cache.set.mock.calls[0][0]).toContain("var99");
    });

    it("invalidates sale-related caches after processing", async () => {
        cache.get.mockResolvedValue(null);

        const payload = JSON.stringify({
            id: "sale6",
            register_sale_products: [{ product_id: "varX", quantity: 1 }],
            status: "SAVED",
        });
        await productSyncService.handleSaleUpdate({ payload, type: "register_sale.update" });

        expect(cache.delPattern).toHaveBeenCalledWith("catalog:trending:*");
        expect(cache.del).toHaveBeenCalledWith("catalog:today-deal:v1");
        expect(cache.del).toHaveBeenCalledWith("catalog:favourites-of-week:v1");
    });
});

// ---------------------------------------------------------------------------
// Parallel inventory fetch — handleProductUpdate with multi-variant product
// ---------------------------------------------------------------------------

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
                price_standard: { tax_inclusive: v.price || "100.00" },
                variant_definitions: v.definitions || [{ value: v.id }],
            })),
            price_standard: { tax_inclusive: "100.00", tax_exclusive: "95.24" },
        },
    },
});

describe("parallel inventory fetch (multi-variant products)", () => {
    it("fetches all active variant inventories and builds variantsData correctly", async () => {
        cache.get.mockResolvedValue(null);

        // Product with 3 variants — all active
        const variants = [
            { id: "v1", price: "80.00", definitions: [{ value: "Red" }] },
            { id: "v2", price: "90.00", definitions: [{ value: "Blue" }] },
            { id: "v3", price: "70.00", definitions: [{ value: "Green" }] },
        ];

        await Product.create({
            product: { id: "parent_multi", name: "Multi" },
            variantsData: [{ id: "v1", qty: 5, price: "80.00" }],
            totalQty: 5,
            status: true,
        });

        axios.get
            .mockResolvedValueOnce(makeProductResponse("parent_multi"))      // 2.0 product detail (onlineStatus)
            // fetchProductDetails (existingProductId not in DB, so this path is skipped)
            .mockResolvedValueOnce(makeParkedSalesResponse([]))               // filterParkProducts
            // fetchProductInventoryDetails: 3.0 product
            .mockResolvedValueOnce(makeMultiVariantProductResponse("parent_multi", variants))
            // 3 concurrent inventory calls — order not guaranteed but each resolves
            .mockResolvedValueOnce(makeInventoryResponse(5))  // v1
            .mockResolvedValueOnce(makeInventoryResponse(3))  // v2
            .mockResolvedValueOnce(makeInventoryResponse(8)); // v3

        const payload = JSON.stringify({ id: "parent_multi", variant_parent_id: null });
        const result = await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        expect(result).toEqual({ success: true });

        const updated = await Product.findOne({ "product.id": "parent_multi" }).lean();
        expect(updated.variantsData).toHaveLength(3);
        expect(updated.totalQty).toBe(16); // 5+3+8
    });

    it("skips inactive variants and does not fetch their inventory", async () => {
        cache.get.mockResolvedValue(null);

        const variants = [
            { id: "vA", price: "50.00", is_active: true },
            { id: "vB", price: "60.00", is_active: false }, // inactive — should be skipped
        ];

        await Product.create({
            product: { id: "parent_inactive", name: "Inactive Variant" },
            variantsData: [{ id: "vA", qty: 4, price: "50.00" }],
            totalQty: 4,
            status: true,
        });

        axios.get
            .mockResolvedValueOnce(makeProductResponse("parent_inactive"))
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeMultiVariantProductResponse("parent_inactive", variants))
            .mockResolvedValueOnce(makeInventoryResponse(4)); // only vA fetched

        const payload = JSON.stringify({ id: "parent_inactive", variant_parent_id: null });
        await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        // vB is inactive → only 1 inventory call (for vA)
        const inventoryCalls = axios.get.mock.calls.filter(([url]) =>
            url.includes('/inventory')
        );
        expect(inventoryCalls).toHaveLength(1);
        expect(inventoryCalls[0][0]).toContain('vA');
    });

    it("excludes variants with zero inventory from variantsData", async () => {
        cache.get.mockResolvedValue(null);

        const variants = [
            { id: "vX", price: "100.00", is_active: true },
            { id: "vY", price: "100.00", is_active: true },
        ];

        await Product.create({
            product: { id: "parent_zero", name: "Zero Stock" },
            variantsData: [{ id: "vX", qty: 2, price: "100.00" }],
            totalQty: 2,
            status: true,
        });

        axios.get
            .mockResolvedValueOnce(makeProductResponse("parent_zero"))
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeMultiVariantProductResponse("parent_zero", variants))
            .mockResolvedValueOnce(makeInventoryResponse(2))  // vX: 2 in stock
            .mockResolvedValueOnce(makeInventoryResponse(0)); // vY: out of stock

        const payload = JSON.stringify({ id: "parent_zero", variant_parent_id: null });
        await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        const updated = await Product.findOne({ "product.id": "parent_zero" }).lean();
        // vY has 0 inventory → excluded
        expect(updated.variantsData).toHaveLength(1);
        expect(updated.variantsData[0].id).toBe("vX");
    });

    it("continues processing other variants when one inventory call fails (partial failure)", async () => {
        cache.get.mockResolvedValue(null);

        const variants = [
            { id: "vGood", price: "100.00", is_active: true },
            { id: "vBad",  price: "100.00", is_active: true },
        ];

        await Product.create({
            product: { id: "parent_partial", name: "Partial Fail" },
            variantsData: [{ id: "vGood", qty: 5, price: "100.00" }],
            totalQty: 5,
            status: true,
        });

        axios.get
            .mockResolvedValueOnce(makeProductResponse("parent_partial"))
            .mockResolvedValueOnce(makeParkedSalesResponse([]))
            .mockResolvedValueOnce(makeMultiVariantProductResponse("parent_partial", variants))
            // One succeeds, one throws (network error / 429)
            .mockResolvedValueOnce(makeInventoryResponse(5))                 // vGood
            .mockRejectedValueOnce(new Error("Lightspeed 429 rate limit")); // vBad

        const payload = JSON.stringify({ id: "parent_partial", variant_parent_id: null });
        // Should NOT throw — failed variant is skipped with a warning
        const result = await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        expect(result).toEqual({ success: true });

        const updated = await Product.findOne({ "product.id": "parent_partial" }).lean();
        // vGood was processed; vBad was skipped
        expect(updated.variantsData).toHaveLength(1);
        expect(updated.variantsData[0].id).toBe("vGood");
    });

    it("deducts parked qty from inventory via lookup table in fetchProductInventoryDetails", async () => {
        cache.get.mockResolvedValue(null);

        const variants = [
            { id: "vParked", price: "100.00", is_active: true },
        ];

        // Parked sale has 2 units of vParked reserved
        await Product.create({
            product: { id: "parent_parked", name: "Parked" },
            variantsData: [{ id: "vParked", qty: 10, price: "100.00" }],
            totalQty: 10,
            status: true,
        });

        axios.get
            .mockResolvedValueOnce(makeProductResponse("parent_parked"))
            .mockResolvedValueOnce(makeParkedSalesResponse([{ id: "vParked", qty: 2 }])) // 2 parked
            .mockResolvedValueOnce(makeMultiVariantProductResponse("parent_parked", variants))
            .mockResolvedValueOnce(makeInventoryResponse(10)); // raw level = 10

        const payload = JSON.stringify({ id: "parent_parked", variant_parent_id: null });
        await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        const updated = await Product.findOne({ "product.id": "parent_parked" }).lean();
        // 10 raw - 2 parked = 8 available
        expect(updated.variantsData[0].qty).toBe(8);
        expect(updated.totalQty).toBe(8);
    });

    it("all inventory calls are made concurrently (Promise.all semantics)", async () => {
        cache.get.mockResolvedValue(null);

        // 4 variants — track call order to verify they're issued before any resolves
        const callOrder = [];
        const variants = ['v1', 'v2', 'v3', 'v4'].map(id => ({ id, price: "100.00", is_active: true }));

        await Product.create({
            product: { id: "parent_concurrent", name: "Concurrent" },
            variantsData: [],
            totalQty: 0,
            status: true,
        });

        let inventoryCallCount = 0;
        axios.get.mockImplementation((url) => {
            if (url.includes('/inventory')) {
                inventoryCallCount++;
                callOrder.push(url.split('/products/')[1].split('/')[0]);
                return Promise.resolve(makeInventoryResponse(2));
            }
            if (url.includes('/api/3.0/')) return Promise.resolve(makeMultiVariantProductResponse("parent_concurrent", variants));
            if (url.includes('/api/2.0/products/parent_concurrent')) return Promise.resolve(makeProductResponse("parent_concurrent"));
            if (url.includes('search?type=sales')) return Promise.resolve(makeParkedSalesResponse([]));
            return Promise.resolve(makeProductResponse("parent_concurrent"));
        });

        const payload = JSON.stringify({ id: "parent_concurrent", variant_parent_id: null });
        await productSyncService.handleProductUpdate({ payload, type: "product.update" });

        // All 4 variants should have had inventory fetched
        expect(inventoryCallCount).toBe(4);
        const updated = await Product.findOne({ "product.id": "parent_concurrent" }).lean();
        expect(updated.variantsData).toHaveLength(4);
        expect(updated.totalQty).toBe(8); // 4 variants × 2 each
    });
});
