#!/usr/bin/env node
/**
 * Reconcile Mongo `Product.status` against Lightspeed's
 * `ecwid_enabled_webstore` (canonical "sell on webstore" flag).
 *
 * Why: BUG-054 — cron/refresh/inventory paths derived `status` from
 * totalQty>0, ignoring ecwid_enabled_webstore. This script finds Mongo
 * products marked `status: true` (visible online) whose Lightspeed source
 * actually says `ecwid_enabled_webstore: false` (in-store only) — i.e.
 * silent catalog leaks — and optionally flips them back to status:false.
 *
 * Default: DRY-RUN. Pass --apply to write.
 *
 *   node scripts/reconcile-online-status.js
 *   node scripts/reconcile-online-status.js --apply
 *   node scripts/reconcile-online-status.js --concurrency 8 --apply
 *   node scripts/reconcile-online-status.js --limit 50           (try a small slice first)
 */
'use strict';
require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const { mapLimit } = require('async');

const API_KEY = process.env.API_KEY;
const LS_BASE = 'https://bazaargeneraltrading.retail.lightspeed.app/api';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const CONCURRENCY = argVal('--concurrency', 6);
const LIMIT = argVal('--limit', 0);

if (!API_KEY) { console.error('Missing API_KEY in env.'); process.exit(1); }
if (!process.env.MONGO_URI) { console.error('Missing MONGO_URI in env.'); process.exit(1); }

const auth = { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } };

async function fetchOnlineStatusFromV2(productId) {
  try {
    const res = await axios.get(`${LS_BASE}/2.0/products/${productId}`, auth);
    const data = res?.data?.data;
    if (!data) return { ok: false, reason: 'empty-payload' };
    return {
      ok: true,
      ecwid: data.ecwid_enabled_webstore,
      is_active: data.is_active,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `lightspeed-${err.response?.status || 'err'}: ${err.message}`,
    };
  }
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (read-only)'}`);
  console.log(`Concurrency: ${CONCURRENCY}${LIMIT ? `, limit: ${LIMIT}` : ''}`);

  await mongoose.connect(process.env.MONGO_URI);
  const Product = mongoose.connection.db.collection('products');

  const cursor = Product.find(
    { status: true },
    { projection: { 'product.id': 1, 'product.name': 1, status: 1, totalQty: 1 } }
  );
  const candidates = [];
  for await (const doc of cursor) {
    if (doc?.product?.id) candidates.push(doc);
    if (LIMIT && candidates.length >= LIMIT) break;
  }
  console.log(`\nCandidates: ${candidates.length} products with status:true in Mongo.`);

  const counters = {
    total: candidates.length,
    correctlyOnline: 0,            // ecwid: true → keep status:true
    leakInStoreOnly: 0,             // ecwid: false → should be status:false
    leakUndefined: 0,               // ecwid: undefined → ambiguous
    lookupFailed: 0,
    flipped: 0,
    flipFailed: 0,
  };
  const leaks = [];
  const failures = [];

  let processed = 0;
  await mapLimit(candidates, CONCURRENCY, async (doc) => {
    const id = doc.product.id;
    const r = await fetchOnlineStatusFromV2(id);
    processed++;
    if (processed % 50 === 0) {
      process.stdout.write(`  ...${processed}/${candidates.length}\n`);
    }

    if (!r.ok) {
      counters.lookupFailed++;
      failures.push({ id, name: doc.product.name, reason: r.reason });
      return;
    }

    if (r.ecwid === true) {
      counters.correctlyOnline++;
      return;
    }
    if (r.ecwid === false) {
      counters.leakInStoreOnly++;
      leaks.push({ id, name: doc.product.name, totalQty: doc.totalQty, ecwid: false, is_active: r.is_active });
    } else {
      counters.leakUndefined++;
      // Treat as ambiguous — don't include in flip set unless explicitly chosen.
      // (Most products with status:true and ecwid:undefined are likely older
      // products where Lightspeed's flag wasn't initialized; safer to leave alone.)
    }
  });

  console.log('\n=== Lightspeed reconciliation summary ===');
  console.log(counters);

  if (leaks.length) {
    console.log(`\n--- LEAKS (Mongo says online, Lightspeed says in-store-only): ${leaks.length} ---`);
    leaks.slice(0, 20).forEach((l) =>
      console.log(`  ${l.id}  qty=${l.totalQty}  active=${l.is_active}  "${l.name}"`)
    );
    if (leaks.length > 20) console.log(`  ... and ${leaks.length - 20} more`);
  }
  if (failures.length) {
    console.log(`\n--- LOOKUP FAILURES: ${failures.length} ---`);
    failures.slice(0, 10).forEach((f) => console.log(`  ${f.id}  ${f.reason}`));
  }

  if (!APPLY) {
    console.log('\nDRY-RUN complete. Re-run with --apply to flip status:false on the LEAKS set.');
    await mongoose.disconnect();
    return;
  }

  if (!leaks.length) {
    console.log('\nNothing to flip.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nApplying status:false to ${leaks.length} leaked products...`);
  for (const leak of leaks) {
    try {
      const nowIso = new Date().toISOString();
      const res = await Product.updateOne(
        { 'product.id': leak.id },
        { $set: { status: false, webhook: 'reconcile-online-status', webhookTime: nowIso } }
      );
      if (res.modifiedCount === 1) counters.flipped++;
      else counters.flipFailed++;
    } catch (err) {
      counters.flipFailed++;
      console.error(`  flip failed for ${leak.id}: ${err.message}`);
    }
  }

  console.log('\n=== Apply complete ===');
  console.log({ flipped: counters.flipped, flipFailed: counters.flipFailed });

  await mongoose.disconnect();
})().catch((e) => { console.error(e?.stack || e?.message || e); process.exit(1); });
