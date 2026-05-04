'use strict';

require('../setup');

jest.mock('axios');
// Mock only appendFileSync so cron.log writes are suppressed in tests.
// Using jest.spyOn after require avoids conflicting with mongodb-memory-server's
// own use of the real `fs` module during setup.
jest.mock('../../src/utilities/cache', () => ({
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    key: (...parts) => parts.join(':'),
}));

const fs = require('fs');
const axios = require('axios');
const Product = require('../../src/models/Product');
const { updateParkedDetails, updateSoldItems } = require('../../src/scripts/updateProductsNew');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProductDoc({ parentId, variants }) {
    return {
        product: {
            id: parentId,
            name: `Product ${parentId}`,
            price_standard: { tax_inclusive: '100.00', tax_exclusive: '95.24' },
        },
        variantsData: variants.map(v => ({
            id: v.id,
            qty: v.qty ?? 10,
            price: v.price ?? '100.00',
            sku: v.sku ?? `SKU-${v.id}`,
            name: v.name ?? `Variant ${v.id}`,
        })),
        totalQty: variants.reduce((s, v) => s + (v.qty ?? 10), 0),
        status: true,
        webhook: 'product.update',
        webhookTime: '10:00:00 AM - 01 January, 2026',
    };
}

const makeLightspeedProductResponse = (id, isActive = true) => ({
    data: { data: { id, name: `Product ${id}`, is_active: isActive } },
});

const makeInventoryResponse = (level) => ({
    data: { data: [{ inventory_level: level }] },
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
// Tests
// ---------------------------------------------------------------------------

describe('updateParkedDetails — batch DB fetch (N+1 fix)', () => {
    it('returns 0 immediately with no DB calls when productIds is empty', async () => {
        const count = await updateParkedDetails([]);

        expect(count).toBe(0);
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('returns 0 immediately with no DB calls when productIds is undefined', async () => {
        const count = await updateParkedDetails(undefined);

        expect(count).toBe(0);
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('fetches all parent products in a single batch query (not one per variant)', async () => {
        // Spy on Product.find to count DB calls
        const findSpy = jest.spyOn(Product, 'find');

        await Product.create(makeProductDoc({
            parentId: 'p1',
            variants: [{ id: 'v1', qty: 5 }, { id: 'v2', qty: 3 }],
        }));

        // Two parked items from the same parent — should still only do 1 batch query
        const parkedItems = [
            { product: 'v1', qty: 1, status: 'SAVED' },
            { product: 'v2', qty: 1, status: 'SAVED' },
        ];

        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p1'))
            .mockResolvedValueOnce(makeInventoryResponse(4))
            .mockResolvedValueOnce(makeLightspeedProductResponse('p1'))
            .mockResolvedValueOnce(makeInventoryResponse(2));

        await updateParkedDetails(parkedItems);

        // Only 1 Product.find call for the batch — not 2 separate findOne calls
        const productFindCalls = findSpy.mock.calls.filter(
            ([query]) => query && query['variantsData.id']
        );
        expect(productFindCalls).toHaveLength(1);
        expect(productFindCalls[0][0]['variantsData.id'].$in).toEqual(
            expect.arrayContaining(['v1', 'v2'])
        );
        findSpy.mockRestore();
    });

    it('updates variant qty and totalQty correctly for a SAVED sale (deducts parked qty)', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p1',
            variants: [{ id: 'v1', qty: 10 }, { id: 'v2', qty: 5 }],
        }));

        // v1 has 2 units parked — Lightspeed live level is 10, after deduction → 8
        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p1'))
            .mockResolvedValueOnce(makeInventoryResponse(10)); // raw level

        const count = await updateParkedDetails([
            { product: 'v1', qty: 2, status: 'SAVED' },
        ]);

        expect(count).toBe(1);

        const updated = await Product.findOne({ 'product.id': 'p1' }).lean();
        const v1 = updated.variantsData.find(v => v.id === 'v1');
        expect(v1.qty).toBe(8); // 10 - 2 parked = 8
        // v2 is untouched
        const v2 = updated.variantsData.find(v => v.id === 'v2');
        expect(v2.qty).toBe(5);
        // totalQty = 8 + 5 = 13
        expect(updated.totalQty).toBe(13);
        expect(updated.status).toBe(true);
    });

    it('does NOT deduct qty for OPEN sales (only SAVED triggers deduction)', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p2',
            variants: [{ id: 'v3', qty: 10 }],
        }));

        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p2'))
            .mockResolvedValueOnce(makeInventoryResponse(10));

        await updateParkedDetails([
            { product: 'v3', qty: 5, status: 'OPEN' }, // OPEN — no deduction
        ]);

        const updated = await Product.findOne({ 'product.id': 'p2' }).lean();
        const v3 = updated.variantsData.find(v => v.id === 'v3');
        expect(v3.qty).toBe(10); // untouched — status is OPEN
    });

    it('does not overwrite status when all variants reach zero qty (storefront uses totalQty>0 to hide)', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p3',
            variants: [{ id: 'v4', qty: 2 }],
        }));

        // After SAVED deduction of 2, live level becomes 0
        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p3'))
            .mockResolvedValueOnce(makeInventoryResponse(2)); // 2 - 2 = 0

        await updateParkedDetails([
            { product: 'v4', qty: 2, status: 'SAVED' },
        ]);

        const updated = await Product.findOne({ 'product.id': 'p3' }).lean();
        expect(updated.totalQty).toBe(0);
        // Status is owned by the product.update webhook handler. The cron must
        // never derive status from qty — that proxy silently re-publishes
        // in-store-only items online. Storefront queries already filter on
        // totalQty > 0, so an out-of-stock product is correctly hidden without
        // mutating status.
        expect(updated.status).toBe(true); // unchanged from seed
    });

    it('skips variants not found in DB and logs them, without crashing', async () => {
        // No Product in DB for 'ghost_variant'
        const count = await updateParkedDetails([
            { product: 'ghost_variant', qty: 1, status: 'SAVED' },
        ]);

        expect(count).toBe(0);
        expect(axios.get).not.toHaveBeenCalled(); // no inventory fetch for unknown variant
    });

    it('handles multiple parked items across different parent products in one batch', async () => {
        await Product.create(makeProductDoc({
            parentId: 'pa',
            variants: [{ id: 'va1', qty: 10 }],
        }));
        await Product.create(makeProductDoc({
            parentId: 'pb',
            variants: [{ id: 'vb1', qty: 8 }],
        }));

        // Lightspeed returns raw level; SAVED deducts qty → 10-3=7, 8-3=5
        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('pa'))
            .mockResolvedValueOnce(makeInventoryResponse(10)) // pa raw=10, SAVED-3 → 7
            .mockResolvedValueOnce(makeLightspeedProductResponse('pb'))
            .mockResolvedValueOnce(makeInventoryResponse(8)); // pb raw=8, SAVED-3 → 5

        const count = await updateParkedDetails([
            { product: 'va1', qty: 3, status: 'SAVED' },
            { product: 'vb1', qty: 3, status: 'SAVED' },
        ]);

        expect(count).toBe(2);

        const updatedA = await Product.findOne({ 'product.id': 'pa' }).lean();
        expect(updatedA.variantsData[0].qty).toBe(7);

        const updatedB = await Product.findOne({ 'product.id': 'pb' }).lean();
        expect(updatedB.variantsData[0].qty).toBe(5);
    });

    it('skips updating an inactive product and does not count it', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_inactive',
            variants: [{ id: 'v_inactive', qty: 5 }],
        }));

        // fetchProductInventory returns undefined when product is inactive
        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p_inactive', false)) // is_active: false
            .mockResolvedValueOnce(makeInventoryResponse(5));

        const count = await updateParkedDetails([
            { product: 'v_inactive', qty: 1, status: 'SAVED' },
        ]);

        // Inactive product — fetchProductInventory returns undefined, loop should skip gracefully
        expect(count).toBe(0);

        // DB record should be unchanged
        const unchanged = await Product.findOne({ 'product.id': 'p_inactive' }).lean();
        expect(unchanged.variantsData[0].qty).toBe(5);
    });

    it('mixes found and not-found variants gracefully — only found ones are counted', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_mixed',
            variants: [{ id: 'v_real', qty: 6 }],
        }));

        // raw=6, SAVED deducts 2 → 4
        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p_mixed'))
            .mockResolvedValueOnce(makeInventoryResponse(6));

        const count = await updateParkedDetails([
            { product: 'v_ghost', qty: 1, status: 'SAVED' }, // not in DB
            { product: 'v_real',  qty: 2, status: 'SAVED' }, // in DB
        ]);

        expect(count).toBe(1); // only the real variant counted

        const updated = await Product.findOne({ 'product.id': 'p_mixed' }).lean();
        expect(updated.variantsData[0].qty).toBe(4); // 6 - 2 = 4
    });

    it('returns 0 and logs error when Lightspeed API throws, without crashing the cron', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_apierr',
            variants: [{ id: 'v_apierr', qty: 5 }],
        }));

        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p_apierr'))
            .mockRejectedValueOnce(new Error('Lightspeed 503'));

        // fetchProductInventory re-throws — updateParkedDetails catches and returns 0
        const count = await updateParkedDetails([
            { product: 'v_apierr', qty: 1, status: 'SAVED' },
        ]);

        expect(count).toBe(0);
    });

    it('sets webhook field to "updateParkedDetails" and webhookTime after update', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_webhook',
            variants: [{ id: 'v_webhook', qty: 8 }],
        }));

        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p_webhook'))
            .mockResolvedValueOnce(makeInventoryResponse(6));

        await updateParkedDetails([
            { product: 'v_webhook', qty: 2, status: 'SAVED' },
        ]);

        const updated = await Product.findOne({ 'product.id': 'p_webhook' }).lean();
        expect(updated.webhook).toBe('updateParkedDetails');
        expect(updated.webhookTime).toBeTruthy();
    });

    it('correctly maps variant IDs when a parent has multiple variants (only target variant qty changes)', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_multi',
            variants: [
                { id: 'vm1', qty: 10 },
                { id: 'vm2', qty: 7 },
                { id: 'vm3', qty: 4 },
            ],
        }));

        // Only vm2 is parked
        axios.get
            .mockResolvedValueOnce(makeLightspeedProductResponse('p_multi'))
            .mockResolvedValueOnce(makeInventoryResponse(5)); // vm2: raw=5, no deduction (OPEN)

        await updateParkedDetails([
            { product: 'vm2', qty: 2, status: 'OPEN' },
        ]);

        const updated = await Product.findOne({ 'product.id': 'p_multi' }).lean();
        expect(updated.variantsData.find(v => v.id === 'vm1').qty).toBe(10); // untouched
        expect(updated.variantsData.find(v => v.id === 'vm2').qty).toBe(5);  // updated
        expect(updated.variantsData.find(v => v.id === 'vm3').qty).toBe(4);  // untouched
        expect(updated.totalQty).toBe(19); // 10 + 5 + 4
    });

    it('correctly computes totalQty when two variants of the same parent are both parked (stale-snapshot fix)', async () => {
        // Parent has two variants: va (qty=10) and vb (qty=8).
        // Both are in the parked list. Without the fix the second iteration would
        // compute totalQty from the pre-fetch snapshot (va=10, vb live), getting
        // the wrong total. With the fix the Map is updated after each iteration
        // so the second iteration sees the already-committed va qty.
        await Product.create(makeProductDoc({
            parentId: 'p_two_parked',
            variants: [
                { id: 'va', qty: 10 },
                { id: 'vb', qty: 8 },
            ],
        }));

        axios.get
            // Iteration 1: va — raw=9, SAVED-1 → 8
            .mockResolvedValueOnce(makeLightspeedProductResponse('p_two_parked'))
            .mockResolvedValueOnce(makeInventoryResponse(9))
            // Iteration 2: vb — raw=6, SAVED-2 → 4
            .mockResolvedValueOnce(makeLightspeedProductResponse('p_two_parked'))
            .mockResolvedValueOnce(makeInventoryResponse(6));

        const count = await updateParkedDetails([
            { product: 'va', qty: 1, status: 'SAVED' },
            { product: 'vb', qty: 2, status: 'SAVED' },
        ]);

        expect(count).toBe(2);

        const updated = await Product.findOne({ 'product.id': 'p_two_parked' }).lean();
        expect(updated.variantsData.find(v => v.id === 'va').qty).toBe(8);
        expect(updated.variantsData.find(v => v.id === 'vb').qty).toBe(4);
        // totalQty must reflect both iterations: 8 + 4 = 12, NOT 10 + 4 = 14 (stale)
        expect(updated.totalQty).toBe(12);
    });
});

// ---------------------------------------------------------------------------
// updateSoldItems — sold qty summed across ALL variants (not just first)
// ---------------------------------------------------------------------------

const makeSalesApiResponse = (lineItems, versionMax = '') => ({
    data: {
        data: lineItems.map(item => ({
            line_items: [{ product_id: item.variantId, quantity: item.qty }],
        })),
        version: { max: versionMax },
    },
});

describe('updateSoldItems — aggregate sold qty across all variants', () => {
    it('sums sold qty from all variants of a multi-variant product', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_sold_multi',
            variants: [
                { id: 'sv1', qty: 5 },
                { id: 'sv2', qty: 3 },
            ],
        }));

        // sv1 sold 10, sv2 sold 5 → total should be 15
        axios.get.mockResolvedValueOnce(makeSalesApiResponse([
            { variantId: 'sv1', qty: 10 },
            { variantId: 'sv2', qty: 5 },
        ]));

        await updateSoldItems();

        const updated = await Product.findOne({ 'product.id': 'p_sold_multi' }).lean();
        expect(updated.sold).toBe(15); // NOT 10 (first-variant-only bug)
    });

    it('records sold qty correctly for a single-variant product', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_sold_single',
            variants: [{ id: 'sv_only', qty: 8 }],
        }));

        axios.get.mockResolvedValueOnce(makeSalesApiResponse([
            { variantId: 'sv_only', qty: 7 },
        ]));

        await updateSoldItems();

        const updated = await Product.findOne({ 'product.id': 'p_sold_single' }).lean();
        expect(updated.sold).toBe(7);
    });

    it('does not write a sold record when no variants of the product appear in sales', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_no_sales',
            variants: [{ id: 'sv_unsold', qty: 10 }],
        }));

        // Sales for a completely different variant
        axios.get.mockResolvedValueOnce(makeSalesApiResponse([
            { variantId: 'other_variant', qty: 3 },
        ]));

        await updateSoldItems();

        const updated = await Product.findOne({ 'product.id': 'p_no_sales' }).lean();
        // sold field should not have been written by updateSoldItems (may be 0 from schema default)
        expect(updated.sold ?? 0).toBe(0);
    });

    it('handles empty sales response without throwing', async () => {
        await Product.create(makeProductDoc({
            parentId: 'p_empty_sales',
            variants: [{ id: 'sv_e', qty: 5 }],
        }));

        axios.get.mockResolvedValueOnce(makeSalesApiResponse([]));

        await expect(updateSoldItems()).resolves.not.toThrow();
    });
});
