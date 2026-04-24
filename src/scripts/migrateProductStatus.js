/**
 * Migration: backfill Product.status on legacy docs
 *
 * Atlas profiler (2026-04-24) showed Product queries of the shape
 *   { $or: [ { status: { $exists: false } }, { status: true } ], ... }
 * doing collection scans of all 4,883 products because the $or on status
 * prevents the compound index {status, totalQty, discountedPrice} from being
 * used.
 *
 * This mirrors the Notification.status fix: backfill missing status on
 * legacy docs to `true` (conservative default — these products were already
 * being treated as active by the $or pattern), then simplify queries to
 * `status: true` so the compound index is used.
 *
 * IDEMPOTENT.
 *
 * Usage:
 *   node src/scripts/migrateProductStatus.js          # dry run
 *   node src/scripts/migrateProductStatus.js --apply  # execute
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const DRY_RUN = !process.argv.includes("--apply");

async function migrate() {
  await connectDB();
  const db = mongoose.connection.db;
  const products = db.collection("products");

  console.log(DRY_RUN ? "=== DRY RUN (pass --apply to execute) ===" : "=== APPLYING MIGRATION ===");

  const total = await products.countDocuments({});
  const missingStatus = { $or: [{ status: null }, { status: { $exists: false } }] };
  const missingCount = await products.countDocuments(missingStatus);
  console.log(`Total products: ${total}`);
  console.log(`Docs with null/missing status (legacy): ${missingCount}`);

  if (missingCount === 0) {
    console.log("Nothing to migrate.");
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log("Dry run complete. Re-run with --apply to execute.");
    await mongoose.disconnect();
    return;
  }

  const r = await products.updateMany(missingStatus, { $set: { status: true } });
  console.log(`Backfilled status=true: matched=${r.matchedCount} modified=${r.modifiedCount}`);

  const stillMissing = await products.countDocuments(missingStatus);
  console.log(`Docs still missing status after migration: ${stillMissing}`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
