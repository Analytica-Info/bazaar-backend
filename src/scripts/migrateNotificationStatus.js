/**
 * Migration: backfill Notification.status on legacy docs
 *
 * Atlas profiler (2026-04-24 23:57 UTC) showed the scheduled-notification cron
 * scanning all 61,976 notifications per run because the index on
 * {sentAt:1, scheduledDateTime:1} cannot efficiently satisfy a query of the
 * form `{ $or: [status=pending, status null, status missing], sentAt: null }`.
 *
 * Root cause: old docs were written before the `status` default existed, so
 * the scheduler has to OR three status variants — defeats the index.
 *
 * Fix: normalize every notification to a concrete status ('pending' | 'sent' |
 * 'failed') so the new partial index { scheduledDateTime: 1 } with
 * partialFilterExpression { status: 'pending' } can cover the cron query in
 * ~50 doc reads instead of ~62K.
 *
 * IDEMPOTENT — safe to run multiple times.
 *
 * Usage:
 *   node src/scripts/migrateNotificationStatus.js          # dry run
 *   node src/scripts/migrateNotificationStatus.js --apply  # execute
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const DRY_RUN = !process.argv.includes("--apply");

async function migrate() {
  await connectDB();
  const db = mongoose.connection.db;
  const notifications = db.collection("notifications");

  console.log(DRY_RUN ? "=== DRY RUN (pass --apply to execute) ===" : "=== APPLYING MIGRATION ===");

  const total = await notifications.countDocuments({});
  console.log(`Total notifications: ${total}`);

  // 1. sent notifications: have sentAt AND missing/null status -> status='sent'
  const sentMissing = await notifications.countDocuments({
    sentAt: { $ne: null, $exists: true },
    $or: [{ status: null }, { status: { $exists: false } }],
  });
  console.log(`Docs needing status='sent': ${sentMissing}`);

  // 2. pending notifications: no sentAt AND missing/null status -> status='pending'
  const pendingMissing = await notifications.countDocuments({
    $or: [{ sentAt: null }, { sentAt: { $exists: false } }],
    $and: [{ $or: [{ status: null }, { status: { $exists: false } }] }],
  });
  console.log(`Docs needing status='pending': ${pendingMissing}`);

  if (DRY_RUN) {
    console.log("Dry run complete. Re-run with --apply to execute.");
    await mongoose.disconnect();
    return;
  }

  if (sentMissing > 0) {
    const r1 = await notifications.updateMany(
      {
        sentAt: { $ne: null, $exists: true },
        $or: [{ status: null }, { status: { $exists: false } }],
      },
      { $set: { status: "sent" } }
    );
    console.log(`Backfilled status='sent': matched=${r1.matchedCount} modified=${r1.modifiedCount}`);
  }

  if (pendingMissing > 0) {
    const r2 = await notifications.updateMany(
      {
        $or: [{ sentAt: null }, { sentAt: { $exists: false } }],
        $and: [{ $or: [{ status: null }, { status: { $exists: false } }] }],
      },
      { $set: { status: "pending" } }
    );
    console.log(`Backfilled status='pending': matched=${r2.matchedCount} modified=${r2.modifiedCount}`);
  }

  // Verification — should be 0
  const stillMissing = await notifications.countDocuments({
    $or: [{ status: null }, { status: { $exists: false } }],
  });
  console.log(`Docs still missing status after migration: ${stillMissing}`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
