#!/usr/bin/env node
/**
 * Read-only: identify the actual at-risk-now set for BUG-054.
 *
 * Risk model: any product that (a) is referenced by an active SAVED parked
 * sale in Lightspeed, AND (b) has ecwid_enabled_webstore !== true in Lightspeed,
 * will be silently flipped to status:true by the next updateParkedDetails
 * cron run. The buggy state may be corrected by the subsequent
 * updateInactiveDetails stage, but Dell4455 proves correction isn't
 * guaranteed.
 *
 * This script does NOT depend on Mongo's current status — it measures
 * future-leak risk regardless of whether the leak has manifested yet.
 */
'use strict';
require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const { mapLimit } = require('async');

const API_KEY = process.env.API_KEY;
const LS_BASE = 'https://bazaargeneraltrading.retail.lightspeed.app/api';
const auth = { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } };

(async () => {
  if (!API_KEY) { console.error('Missing API_KEY'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const Product = mongoose.connection.db.collection('products');

  // 1. Pull all parked (SAVED) sales — same source the cron uses.
  console.log('Fetching all SAVED parked sales from Lightspeed...');
  const salesRes = await axios.get(
    `${LS_BASE}/2.0/search?type=sales&status=SAVED`,
    auth
  );
  const sales = salesRes.data?.data || [];
  console.log(`  ${sales.length} parked sales total`);

  // 2. Collect every variant id referenced.
  const parkedVariantIds = new Set();
  for (const s of sales) {
    for (const li of s.line_items || []) {
      if (li.product_id) parkedVariantIds.add(li.product_id);
    }
  }
  console.log(`  ${parkedVariantIds.size} distinct variant ids in parked line items`);

  // 3. Map variant ids → parent product ids via Mongo (same lookup pattern as the cron).
  const parents = await Product.find(
    { 'variantsData.id': { $in: [...parkedVariantIds] } },
    { projection: { 'product.id': 1, 'product.name': 1, status: 1, totalQty: 1, variantsData: 1 } }
  ).toArray();

  const parentIds = parents.map((p) => p.product?.id).filter(Boolean);
  const uniqueParentIds = [...new Set(parentIds)];
  console.log(`  ${uniqueParentIds.length} distinct parent products own those variants`);

  // 4. For each parent, query Lightspeed 2.0 and classify.
  console.log(`\nQuerying Lightspeed 2.0 for ecwid_enabled_webstore on each parent...`);
  const classified = await mapLimit(parents, 6, async (p) => {
    const id = p.product.id;
    try {
      const r = await axios.get(`${LS_BASE}/2.0/products/${id}`, auth);
      const ecwid = r.data?.data?.ecwid_enabled_webstore;
      return {
        id,
        name: p.product.name,
        mongoStatus: p.status,
        mongoTotalQty: p.totalQty,
        ecwid,
        risk: ecwid !== true,  // anything not strictly true is at risk
      };
    } catch (err) {
      return { id, name: p.product.name, mongoStatus: p.status, ecwid: 'ERR', err: err.message, risk: null };
    }
  });

  const atRisk = classified.filter((c) => c.risk === true);
  const safe = classified.filter((c) => c.risk === false);
  const unknown = classified.filter((c) => c.risk === null);

  console.log('\n=== AT-RISK SET (parked-sale parents whose Lightspeed flag is NOT true) ===');
  console.log(`  Safe (ecwid:true):       ${safe.length}`);
  console.log(`  AT RISK (ecwid:false):   ${atRisk.filter((c) => c.ecwid === false).length}`);
  console.log(`  AMBIGUOUS (ecwid:undef): ${atRisk.filter((c) => c.ecwid === undefined).length}`);
  console.log(`  Lookup error:            ${unknown.length}`);

  if (atRisk.length) {
    console.log('\n--- AT-RISK PRODUCTS (next cron cycle may flip to status:true) ---');
    atRisk.forEach((c) =>
      console.log(
        `  ${c.id}  mongoStatus=${c.mongoStatus}  totalQty=${c.mongoTotalQty}  ecwid=${c.ecwid}  "${c.name}"`
      )
    );

    // Of those at-risk, which are CURRENTLY leaking (mongo says true)?
    const currentlyLeaking = atRisk.filter((c) => c.mongoStatus === true);
    if (currentlyLeaking.length) {
      console.log(`\n  Of which, CURRENTLY leaking (mongoStatus:true): ${currentlyLeaking.length}`);
    }
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e?.stack || e?.message || e); process.exit(1); });
