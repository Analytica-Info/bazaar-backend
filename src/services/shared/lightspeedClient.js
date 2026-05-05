'use strict';

/**
 * Shared Lightspeed API helpers used by both checkoutService (web) and the
 * order/ domain (mobile).
 *
 * NOTE — fetchProductDetails price field selection (BUG-028):
 *   The original checkoutService copy used `tax_inclusive` for pricing.
 *   The original order/adapters/lightspeedClient.js copy used `tax_exclusive`.
 *   This shared version uses `tax_inclusive` because checkout is the
 *   customer-facing path and prices should include VAT.
 *   The order/ domain (mobile) should migrate to `tax_inclusive` as well.
 *   See docs/BUGS.md BUG-028 for the full write-up.
 */

const axios = require('axios');
const Product = require('../../repositories').products.rawModel();

const LS_API_KEY = process.env.API_KEY;

async function getDiagnosticInventory(lightspeedVariantId) {
    const diag = { lightspeedQty: null, localQty: null, lightspeedError: null, localError: null };
    try {
        const invRes = await axios.get(
            `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${lightspeedVariantId}/inventory`,
            { headers: { Authorization: `Bearer ${LS_API_KEY}`, Accept: 'application/json' } }
        );
        diag.lightspeedQty = invRes.data?.data?.[0]?.inventory_level ?? null;
    } catch (e) {
        diag.lightspeedError = e?.message || String(e);
    }
    try {
        const doc = await Product.findOne({
            $or: [
                { 'product.id': lightspeedVariantId },
                { 'variantsData.id': lightspeedVariantId },
            ],
        }).lean();
        const v = doc?.variantsData?.find((vv) => String(vv.id) === String(lightspeedVariantId));
        diag.localQty = v != null ? v.qty : null;
        if (!doc) diag.localError = 'Product not found in local DB';
        else if (v == null) diag.localError = `Variant ${lightspeedVariantId} not in variantsData`;
    } catch (e) {
        diag.localError = e?.message || String(e);
    }
    return diag;
}

const fetchProductDetails = async (id) => {
    try {
        const response = await axios.get(
            `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${LS_API_KEY}`,
                    Accept: 'application/json',
                },
            }
        );

        let product = response.data.data;
        if (!product) throw new Error('Product not found.');

        const variantsData = [];
        let totalQty = 0;

        if (product.variants.length === 0) {
            const inventoryResponse = await axios.get(
                `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}/inventory`,
                {
                    headers: {
                        Authorization: `Bearer ${LS_API_KEY}`,
                        Accept: 'application/json',
                    },
                }
            );
            const inventoryLevel =
                inventoryResponse.data.data?.[0]?.inventory_level || 0;

            if (
                inventoryLevel > 0 &&
                parseFloat(product.price_standard.tax_inclusive) !== 0
            ) {
                variantsData.push({
                    qty: inventoryLevel,
                    id: product.id,
                    sku: product.sku_number,
                    name: product.name,
                    price: product.price_standard.tax_inclusive,
                });
                totalQty += inventoryLevel;
            }
        } else {
            for (const variant of product.variants) {
                const variantId = variant.id;
                const variantPrice = variant.price_standard.tax_inclusive;
                const variantDefinitions = variant.variant_definitions;
                let sku = '';
                if (variantDefinitions && variantDefinitions.length > 0) {
                    const values = variantDefinitions.map((def) => def.value);
                    sku = values.join(' - ');
                }
                const inventoryResponse = await axios.get(
                    `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
                    {
                        headers: {
                            Authorization: `Bearer ${LS_API_KEY}`,
                            Accept: 'application/json',
                        },
                    }
                );
                const inventoryLevel =
                    inventoryResponse.data.data?.[0]?.inventory_level || 0;

                if (inventoryLevel > 0 && parseFloat(variantPrice) !== 0) {
                    variantsData.push({
                        qty: inventoryLevel,
                        sku: sku,
                        price: variantPrice,
                        id: variantId,
                        name: variant.name,
                    });
                    totalQty += inventoryLevel;
                }
            }
        }
        return { product, variantsData, totalQty };
    } catch (error) {
        console.error(
            `Error fetching product details for ID: ${id}`,
            error.message
        );
        throw error;
    }
};

module.exports = { getDiagnosticInventory, fetchProductDetails };
