/**
 * Migration script: Standardize Order field names
 *
 * Resolves the userId/user_id and checkout_session_id/stripe_checkout_session_id
 * inconsistency between the Ecommerce and Mobile backends.
 *
 * This script is IDEMPOTENT — safe to run multiple times.
 * All operations are additive (copies data, doesn't delete originals until confirmed).
 *
 * Usage:
 *   node src/scripts/migrateOrderFields.js                # Dry run (default)
 *   node src/scripts/migrateOrderFields.js --apply        # Apply changes
 *   node src/scripts/migrateOrderFields.js --cleanup      # Remove old fields after verifying
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const DRY_RUN = !process.argv.includes("--apply") && !process.argv.includes("--cleanup");
const CLEANUP = process.argv.includes("--cleanup");

async function migrate() {
  await connectDB();
  const db = mongoose.connection.db;
  const orders = db.collection("orders");

  console.log(DRY_RUN ? "=== DRY RUN (pass --apply to execute) ===" : CLEANUP ? "=== CLEANUP MODE ===" : "=== APPLYING MIGRATION ===");

  // 1. Copy userId → user_id where user_id is missing
  const needsUserIdCopy = await orders.countDocuments({
    userId: { $exists: true },
    user_id: { $exists: false },
  });
  console.log(`Orders with userId but no user_id: ${needsUserIdCopy}`);

  if (!DRY_RUN && !CLEANUP && needsUserIdCopy > 0) {
    const result = await orders.updateMany(
      { userId: { $exists: true }, user_id: { $exists: false } },
      [{ $set: { user_id: "$userId" } }]
    );
    console.log(`  → Copied userId to user_id: ${result.modifiedCount} docs`);
  }

  // 2. Copy user_id → userId where userId is missing (reverse direction)
  const needsReverseUserIdCopy = await orders.countDocuments({
    user_id: { $exists: true },
    userId: { $exists: false },
  });
  console.log(`Orders with user_id but no userId: ${needsReverseUserIdCopy}`);

  if (!DRY_RUN && !CLEANUP && needsReverseUserIdCopy > 0) {
    const result = await orders.updateMany(
      { user_id: { $exists: true }, userId: { $exists: false } },
      [{ $set: { userId: "$user_id" } }]
    );
    console.log(`  → Copied user_id to userId: ${result.modifiedCount} docs`);
  }

  // 3. Copy checkout_session_id → stripe_checkout_session_id
  const needsSessionIdCopy = await orders.countDocuments({
    checkout_session_id: { $exists: true },
    stripe_checkout_session_id: { $exists: false },
  });
  console.log(`Orders with checkout_session_id but no stripe_checkout_session_id: ${needsSessionIdCopy}`);

  if (!DRY_RUN && !CLEANUP && needsSessionIdCopy > 0) {
    const result = await orders.updateMany(
      { checkout_session_id: { $exists: true }, stripe_checkout_session_id: { $exists: false } },
      [{ $set: { stripe_checkout_session_id: "$checkout_session_id" } }]
    );
    console.log(`  → Copied: ${result.modifiedCount} docs`);
  }

  // 4. Reverse: stripe_checkout_session_id → checkout_session_id
  const needsReverseSessionCopy = await orders.countDocuments({
    stripe_checkout_session_id: { $exists: true },
    checkout_session_id: { $exists: false },
  });
  console.log(`Orders with stripe_checkout_session_id but no checkout_session_id: ${needsReverseSessionCopy}`);

  if (!DRY_RUN && !CLEANUP && needsReverseSessionCopy > 0) {
    const result = await orders.updateMany(
      { stripe_checkout_session_id: { $exists: true }, checkout_session_id: { $exists: false } },
      [{ $set: { checkout_session_id: "$stripe_checkout_session_id" } }]
    );
    console.log(`  → Copied: ${result.modifiedCount} docs`);
  }

  // 5. Ensure orderfrom index
  const indexes = await orders.indexes();
  const hasOrderfromIndex = indexes.some(
    (idx) => idx.key && idx.key.orderfrom !== undefined
  );
  console.log(`orderfrom index exists: ${hasOrderfromIndex}`);

  if (!DRY_RUN && !CLEANUP && !hasOrderfromIndex) {
    await orders.createIndex({ orderfrom: 1 });
    console.log("  → Created orderfrom index");
  }

  // 6. Initialize missing fields on User collection
  const users = db.collection("users");
  const usersNeedingSessions = await users.countDocuments({ sessions: { $exists: false } });
  const usersNeedingCouponFlag = await users.countDocuments({ usedFirst15Coupon: { $exists: false } });
  console.log(`Users missing sessions[]: ${usersNeedingSessions}`);
  console.log(`Users missing usedFirst15Coupon: ${usersNeedingCouponFlag}`);

  if (!DRY_RUN && !CLEANUP) {
    if (usersNeedingSessions > 0) {
      const result = await users.updateMany(
        { sessions: { $exists: false } },
        { $set: { sessions: [] } }
      );
      console.log(`  → Initialized sessions[]: ${result.modifiedCount} users`);
    }
    if (usersNeedingCouponFlag > 0) {
      const result = await users.updateMany(
        { usedFirst15Coupon: { $exists: false } },
        { $set: { usedFirst15Coupon: false } }
      );
      console.log(`  → Initialized usedFirst15Coupon: ${result.modifiedCount} users`);
    }
  }

  // 7. Initialize missing fields on OrderDetail collection
  const orderDetails = db.collection("orderdetails");
  const detailsNeedingGift = await orderDetails.countDocuments({ isGiftWithPurchase: { $exists: false } });
  console.log(`OrderDetails missing isGiftWithPurchase: ${detailsNeedingGift}`);

  if (!DRY_RUN && !CLEANUP && detailsNeedingGift > 0) {
    const result = await orderDetails.updateMany(
      { isGiftWithPurchase: { $exists: false } },
      { $set: { isGiftWithPurchase: false, nonReturnable: false } }
    );
    console.log(`  → Initialized: ${result.modifiedCount} order details`);
  }

  // 8. Initialize missing fields on Notification collection
  const notifications = db.collection("notifications");
  const notificationsNeedingClicked = await notifications.countDocuments({ clickedUsers: { $exists: false } });
  console.log(`Notifications missing clickedUsers[]: ${notificationsNeedingClicked}`);

  if (!DRY_RUN && !CLEANUP && notificationsNeedingClicked > 0) {
    const result = await notifications.updateMany(
      { clickedUsers: { $exists: false } },
      { $set: { clickedUsers: [] } }
    );
    console.log(`  → Initialized: ${result.modifiedCount} notifications`);
  }

  // CLEANUP mode: remove old field names (only run after verifying --apply worked)
  if (CLEANUP) {
    console.log("\nCleaning up old field names...");
    const r1 = await orders.updateMany(
      { userId: { $exists: true }, user_id: { $exists: true } },
      { $unset: { userId: "" } }
    );
    console.log(`  → Removed userId from ${r1.modifiedCount} orders`);

    const r2 = await orders.updateMany(
      { checkout_session_id: { $exists: true }, stripe_checkout_session_id: { $exists: true } },
      { $unset: { checkout_session_id: "" } }
    );
    console.log(`  → Removed checkout_session_id from ${r2.modifiedCount} orders`);
  }

  console.log("\nDone.");
  await mongoose.connection.close();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
