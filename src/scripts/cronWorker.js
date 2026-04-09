/**
 * Standalone cron worker — runs scheduled jobs independently of the API server.
 *
 * Usage:
 *   node src/scripts/cronWorker.js          # Run all cron jobs
 *   DISABLE_PRODUCT_SYNC=true node ...      # Disable product sync
 *   DISABLE_NOTIFICATIONS=true node ...     # Disable notification cron
 *
 * Features:
 *   - Tracks success/failure status in SyncState collection
 *   - Retries failed syncs (max 3 consecutive failures before alerting)
 *   - Logs structured data via Pino
 *   - Graceful shutdown on SIGTERM/SIGINT
 */

require("dotenv").config();
const mongoose = require("mongoose");
const cron = require("node-cron");
const fs = require("fs");
const axios = require("axios");
const connectDB = require("../config/db");
const logger = require("../utilities/logger");
const Cronjoblog = require("../models/Cronjoblog");
const SyncState = require("../models/SyncState");
const updateProducts = require("./updateProducts");
const updateProductsNew = require("./updateProductsNew");
const sendScheduledNotifications = require("./sendScheduledNotifications");

const BACKEND_URL = process.env.BACKEND_URL;
const LOG_FILE = "cron.log";
const MAX_CONSECUTIVE_FAILURES = 3;
const RETRY_DELAY_MS = 30000; // 30 seconds between retries
let cronJobRunning = false;

function getDubaiTimestamp() {
  return new Date().toLocaleString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "numeric",
    second: "numeric",
    hour12: true,
    timeZone: "Asia/Dubai",
  });
}

async function recordSyncResult(key, status, details = {}) {
  try {
    const update = {
      lastSyncAt: new Date(),
      lastStatus: status,
      lastError: details.error || null,
      failedItems: details.failedItems || [],
    };

    if (status === "success") {
      update.consecutiveFailures = 0;
    } else {
      update.$inc = { consecutiveFailures: 1 };
    }

    if (details.productCount !== undefined) {
      update.lastProductCount = details.productCount;
    }

    const syncState = await SyncState.findOneAndUpdate(
      { key },
      status === "success" ? { $set: update } : { $set: { lastSyncAt: update.lastSyncAt, lastStatus: update.lastStatus, lastError: update.lastError, failedItems: update.failedItems }, $inc: { consecutiveFailures: 1 } },
      { upsert: true, new: true }
    );

    if (syncState.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.error({
        key,
        consecutiveFailures: syncState.consecutiveFailures,
        lastError: update.lastError,
      }, `ALERT: ${key} has failed ${syncState.consecutiveFailures} times consecutively`);
    }

    return syncState;
  } catch (err) {
    logger.error({ err }, "Failed to record sync result");
  }
}

async function runProductSync() {
  const startTime = Date.now();
  const formattedDate = getDubaiTimestamp();

  logger.info("Product sync cron started");
  fs.appendFileSync(LOG_FILE, `Cron job executing at: ${formattedDate}\n`);

  let storedCount = 0, updatedCount = 0, parkedCount = 0, inactiveCount = 0;
  const errors = [];

  // Step 1: updateProducts (v3 API — product details + inventory)
  try {
    const result = await updateProducts();
    storedCount = result?.storedCount || 0;
    updatedCount = result?.updatedCount || 0;
  } catch (error) {
    errors.push(`updateProducts: ${error.message}`);
    logger.error({ err: error }, "updateProducts failed");
  }

  // Step 2: updateProductsNew (v2 API — parked, inactive, discounts, sold)
  try {
    const result = await updateProductsNew();
    parkedCount = result?.parkedCount || 0;
    inactiveCount = result?.inactiveCount || 0;
  } catch (error) {
    errors.push(`updateProductsNew: ${error.message}`);
    logger.error({ err: error }, "updateProductsNew failed");
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  const updatedFormattedDate = getDubaiTimestamp();

  // Log to file and DB
  fs.appendFileSync(LOG_FILE, `Products updated at: ${updatedFormattedDate} (${duration}s)\n`);

  try {
    await Cronjoblog.create({
      cron_job_start: `Cron job executing at: ${formattedDate}`,
      new_products: storedCount,
      total_products: updatedCount,
      parked_products: parkedCount,
      inactive_products: inactiveCount,
      cron_job_end: `Products updated at: ${updatedFormattedDate}`,
    });
  } catch (logErr) {
    logger.warn({ err: logErr }, "Failed to save cron job log");
  }

  // Record sync status
  const status = errors.length === 0 ? "success" : (storedCount > 0 || updatedCount > 0) ? "partial" : "failed";
  await recordSyncResult("cron_product_sync", status, {
    error: errors.length > 0 ? errors.join("; ") : null,
    productCount: storedCount + updatedCount,
  });

  logger.info({
    storedCount, updatedCount, parkedCount, inactiveCount,
    duration: `${duration}s`, status, errors: errors.length,
  }, "Product sync completed");

  // Refresh categories/brands cache
  if (BACKEND_URL) {
    try {
      await axios.get(`${BACKEND_URL}/categories`);
      await axios.get(`${BACKEND_URL}/brands`);
    } catch (apiError) {
      logger.warn({ err: apiError }, "API refresh call failed");
    }
  }
}

async function runNotificationSync() {
  try {
    await sendScheduledNotifications();
  } catch (error) {
    logger.error({ err: error }, "Scheduled notifications cron failed");
    await recordSyncResult("cron_notifications", "failed", {
      error: error.message,
    });
  }
}

async function start() {
  await connectDB();
  logger.info("Cron worker connected to database");

  // Product sync: daily at 3 AM Dubai time
  if (process.env.DISABLE_PRODUCT_SYNC !== "true") {
    cron.schedule(
      "0 3 * * *",
      async () => {
        if (cronJobRunning) {
          logger.warn("Product sync already running — skipping this run");
          return;
        }
        cronJobRunning = true;
        try {
          await runProductSync();
        } finally {
          cronJobRunning = false;
        }
      },
      { scheduled: true, timezone: "Asia/Dubai" }
    );
    logger.info("Product sync cron scheduled (daily 3 AM Dubai)");
  }

  // Scheduled notifications: every minute
  if (process.env.DISABLE_NOTIFICATIONS !== "true") {
    cron.schedule(
      "* * * * *",
      async () => {
        await runNotificationSync();
      },
      { scheduled: true, timezone: "Asia/Dubai" }
    );
    logger.info("Notification cron scheduled (every minute)");
  }
}

start().catch((err) => {
  logger.fatal({ err }, "Cron worker failed to start");
  process.exit(1);
});

// Graceful shutdown
function shutdown(signal) {
  logger.info({ signal }, "Cron worker shutting down");
  mongoose.connection.close(false).then(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Cron worker: Unhandled Promise Rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Cron worker: Uncaught Exception — shutting down");
  cronJobRunning = false; // Reset flag so next process can run
  process.exit(1);
});
