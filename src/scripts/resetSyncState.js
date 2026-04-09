/**
 * Reset sync state — forces full re-sync on next cron run.
 *
 * Usage:
 *   node src/scripts/resetSyncState.js           # Reset all sync keys
 *   node src/scripts/resetSyncState.js products   # Reset products only
 *   node src/scripts/resetSyncState.js inventory   # Reset inventory only
 *   node src/scripts/resetSyncState.js sales       # Reset sales only
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const SyncState = require("../models/SyncState");

const KEY_MAP = {
  products: "lightspeed_products_v3",
  "products-v2": "lightspeed_products_v2",
  inventory: "lightspeed_inventory_v2",
  sales: "lightspeed_sales_v2",
};

async function reset() {
  await connectDB();

  const target = process.argv[2];

  if (target && KEY_MAP[target]) {
    const result = await SyncState.deleteOne({ key: KEY_MAP[target] });
    console.log(`Reset ${target} sync state: ${result.deletedCount ? "done" : "not found"}`);
  } else if (target) {
    console.log(`Unknown target: ${target}`);
    console.log(`Available: ${Object.keys(KEY_MAP).join(", ")}`);
  } else {
    const result = await SyncState.deleteMany({});
    console.log(`Reset all sync states: ${result.deletedCount} deleted`);
  }

  await mongoose.connection.close();
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
