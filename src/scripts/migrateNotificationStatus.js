/**
 * Migration: backfill Notification.status on legacy docs
 *
 * Atlas profiler (2026-04-24 23:57 UTC) showed the scheduled-notification cron
 * scanning all 61,976 notifications per run because the query had to OR three
 * status variants and use $ne:null — defeats the existing index.
 *
 * Goal: partition legacy docs into concrete statuses so a partial index
 * { scheduledDateTime: 1 } where status='pending' stays tiny (only truly
 * active scheduled notifications).
 *
 * Buckets (evaluated against legacy docs with null/missing status):
 *   - sentAt set                                      -> 'sent'
 *   - no sentAt, no scheduledDateTime                 -> 'sent'   (legacy immediate push, already delivered)
 *   - no sentAt, scheduledDateTime < now              -> 'failed' (past due + never sent)
 *   - no sentAt, scheduledDateTime >= now             -> 'pending' (truly active)
 *
 * IDEMPOTENT — only touches docs where status is currently null/missing.
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
  const now = new Date();

  console.log(DRY_RUN ? "=== DRY RUN (pass --apply to execute) ===" : "=== APPLYING MIGRATION ===");

  const missingStatus = { $or: [{ status: null }, { status: { $exists: false } }] };

  const total = await notifications.countDocuments({});
  const legacyTotal = await notifications.countDocuments(missingStatus);
  console.log(`Total notifications: ${total}`);
  console.log(`Docs with null/missing status (legacy): ${legacyTotal}`);

  // 1. sentAt set -> 'sent'
  const sentQuery = {
    ...missingStatus,
    sentAt: { $ne: null, $exists: true },
  };
  const sentCount = await notifications.countDocuments(sentQuery);
  console.log(`-> 'sent' (have sentAt): ${sentCount}`);

  // 2. no sentAt, no scheduledDateTime -> 'sent' (legacy immediate pushes)
  const legacyImmediateQuery = {
    $and: [
      missingStatus,
      { $or: [{ sentAt: null }, { sentAt: { $exists: false } }] },
      { $or: [{ scheduledDateTime: null }, { scheduledDateTime: { $exists: false } }] },
    ],
  };
  const legacyImmediateCount = await notifications.countDocuments(legacyImmediateQuery);
  console.log(`-> 'sent' (legacy immediate, no schedule): ${legacyImmediateCount}`);

  // 3. no sentAt, scheduledDateTime in past -> 'failed'
  const pastDueQuery = {
    $and: [
      missingStatus,
      { $or: [{ sentAt: null }, { sentAt: { $exists: false } }] },
      { scheduledDateTime: { $ne: null, $lt: now } },
    ],
  };
  const pastDueCount = await notifications.countDocuments(pastDueQuery);
  console.log(`-> 'failed' (past due, never sent): ${pastDueCount}`);

  // 4. no sentAt, scheduledDateTime in future -> 'pending'
  const pendingQuery = {
    $and: [
      missingStatus,
      { $or: [{ sentAt: null }, { sentAt: { $exists: false } }] },
      { scheduledDateTime: { $ne: null, $gte: now } },
    ],
  };
  const pendingCount = await notifications.countDocuments(pendingQuery);
  console.log(`-> 'pending' (active scheduled): ${pendingCount}`);

  if (DRY_RUN) {
    console.log("Dry run complete. Re-run with --apply to execute.");
    await mongoose.disconnect();
    return;
  }

  if (sentCount > 0) {
    const r = await notifications.updateMany(sentQuery, { $set: { status: "sent" } });
    console.log(`Applied 'sent' (have sentAt): matched=${r.matchedCount} modified=${r.modifiedCount}`);
  }
  if (legacyImmediateCount > 0) {
    const r = await notifications.updateMany(legacyImmediateQuery, { $set: { status: "sent" } });
    console.log(`Applied 'sent' (legacy immediate): matched=${r.matchedCount} modified=${r.modifiedCount}`);
  }
  if (pastDueCount > 0) {
    const r = await notifications.updateMany(pastDueQuery, { $set: { status: "failed" } });
    console.log(`Applied 'failed' (past due): matched=${r.matchedCount} modified=${r.modifiedCount}`);
  }
  if (pendingCount > 0) {
    const r = await notifications.updateMany(pendingQuery, { $set: { status: "pending" } });
    console.log(`Applied 'pending' (active scheduled): matched=${r.matchedCount} modified=${r.modifiedCount}`);
  }

  // Verification
  const stillMissing = await notifications.countDocuments(missingStatus);
  const finalPending = await notifications.countDocuments({ status: "pending" });
  console.log(`Docs still missing status after migration: ${stillMissing}`);
  console.log(`Total docs with status='pending' (will be in partial index): ${finalPending}`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
