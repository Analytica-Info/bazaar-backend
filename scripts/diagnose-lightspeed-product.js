#!/usr/bin/env node
/**
 * Read-only diagnostic for a Lightspeed product.
 *
 *   node scripts/diagnose-lightspeed-product.js <SKU_OR_ITEM_ID>
 *
 * Resolution order:
 *   1. If the arg looks like a UUID, treat as itemId directly.
 *   2. Otherwise, search Lightspeed by sku_number.
 *
 * Prints: parent flags, every variant (id, sku, is_active, price), per-outlet
 * inventory, and the totalQty our sync would compute. No DB writes, no Mongo.
 */
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.API_KEY;
const BASE = 'https://bazaargeneraltrading.retail.lightspeed.app/api';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!API_KEY) {
  console.error('Missing API_KEY env var. Source your .env first.');
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/diagnose-lightspeed-product.js <SKU_OR_ITEM_ID>');
  process.exit(1);
}

const auth = { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } };

async function resolveItemId(input) {
  if (UUID_RE.test(input)) return input;
  // Lightspeed search by sku
  const url = `${BASE}/2.0/search?type=products&sku=${encodeURIComponent(input)}`;
  const res = await axios.get(url, auth);
  const hits = res.data?.data || [];
  if (!hits.length) throw new Error(`No Lightspeed product found for SKU "${input}"`);
  // Prefer the parent (no variant_parent_id); else first hit.
  const parent = hits.find((p) => !p.variant_parent_id) || hits[0];
  console.log(`Resolved SKU "${input}" → itemId ${parent.id} (parent: ${!parent.variant_parent_id})`);
  return parent.id;
}

async function getProduct(itemId) {
  const res = await axios.get(`${BASE}/3.0/products/${itemId}`, auth);
  return res.data?.data;
}

async function getInventory(productId) {
  const res = await axios.get(`${BASE}/2.0/products/${productId}/inventory`, auth);
  return res.data?.data || [];
}

function fmtPrice(p) {
  const v = p?.tax_inclusive ?? p?.tax_exclusive;
  return v == null ? 'n/a' : v;
}

(async () => {
  const itemId = await resolveItemId(arg);
  const product = await getProduct(itemId);
  if (!product) {
    console.error('Product payload empty.');
    process.exit(1);
  }

  console.log('\n=== PARENT ===');
  console.log({
    id: product.id,
    name: product.name,
    sku_number: product.sku_number,
    is_active: product.is_active,
    ecwid_enabled_webstore: product.ecwid_enabled_webstore,
    has_inventory: product.has_inventory,
    deleted_at: product.deleted_at,
    variantCount: (product.variants || []).length,
    price_standard: fmtPrice(product.price_standard),
  });

  const variants = product.variants || [];
  if (!variants.length) {
    console.log('\nNo variants. Fetching root inventory...');
    const inv = await getInventory(product.id);
    console.log('Per-outlet inventory rows:', inv.length);
    inv.forEach((row, i) =>
      console.log(`  [${i}] outlet=${row.outlet_id} level=${row.inventory_level} reorder=${row.reorder_point}`)
    );
    return;
  }

  console.log(`\n=== ${variants.length} VARIANTS ===`);
  let syncTotalQty = 0;
  const ghosts = [];

  for (const v of variants) {
    const inv = await getInventory(v.id);
    const head = inv[0];
    const isGhost = /-O-CONVERTED$/i.test(v.sku_number || '');
    if (isGhost) ghosts.push(v);

    console.log('\n— variant —');
    console.log({
      id: v.id,
      sku_number: v.sku_number,
      is_active: v.is_active,
      price: fmtPrice(v.price_standard),
      ghostSuspect: isGhost,
      definitions: (v.variant_definitions || []).map((d) => `${d.name}=${d.value}`).join(', '),
      outletRows: inv.length,
    });
    inv.forEach((row, i) =>
      console.log(`    [${i}] outlet=${row.outlet_id} level=${row.inventory_level}`)
    );

    // Replicate sync math (data[0] only, like lightspeedFetchers.js:311)
    const level = head?.inventory_level || 0;
    const price = parseFloat(v.price_standard?.tax_inclusive || 0);
    if (v.is_active && level > 0 && price !== 0) {
      syncTotalQty += level;
      console.log(`    → sync would include qty=${level}`);
    } else {
      console.log(
        `    → sync would EXCLUDE (is_active=${v.is_active}, level=${level}, price=${price})`
      );
    }
  }

  console.log('\n=== VERDICT ===');
  console.log(`syncTotalQty (what storefront shows) = ${syncTotalQty}`);
  if (ghosts.length) {
    console.log(`Ghost variants (-O-CONVERTED) detected: ${ghosts.length}`);
    ghosts.forEach((g) =>
      console.log(`  ghost ${g.id} sku=${g.sku_number} is_active=${g.is_active}`)
    );
    console.log('\nFix: in Lightspeed POS, open each ghost variant and toggle "Enabled" off.');
  } else {
    console.log('No -O-CONVERTED ghost variants found. Mismatch likely from multi-outlet [0] truncation or webhook race.');
  }
})().catch((err) => {
  console.error('Diagnostic failed:', err.response?.status, err.response?.data || err.message);
  process.exit(1);
});
