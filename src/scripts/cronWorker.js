/**
 * Standalone cron worker — runs scheduled jobs independently of the API server.
 *
 * Usage:
 *   node src/scripts/cronWorker.js          # Run all cron jobs
 *   DISABLE_PRODUCT_SYNC=true node ...      # Disable product sync
 *   DISABLE_NOTIFICATIONS=true node ...     # Disable notification cron
 *
 * This can be deployed as a separate process/container to keep cron jobs
 * from competing with API request handling.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const cron = require("node-cron");
const fs = require("fs");
const axios = require("axios");
const connectDB = require("../config/db");
const logger = require("../utilities/logger");
const Cronjoblog = require("../models/Cronjoblog");
const updateProducts = require("./updateProducts");
const updateProductsNew = require("./updateProductsNew");
const sendScheduledNotifications = require("./sendScheduledNotifications");

const BACKEND_URL = process.env.BACKEND_URL;
const LOG_FILE = "cron.log";
let cronJobRunning = false;

async function start() {
  await connectDB();
  logger.info("Cron worker connected to database");

  // Product sync: daily at 3 AM Dubai time
  if (process.env.DISABLE_PRODUCT_SYNC !== "true") {
    cron.schedule(
      "0 3 * * *",
      async () => {
        if (cronJobRunning) return;
        cronJobRunning = true;
        const formattedDate = new Date().toLocaleString("en-US", {
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

        logger.info("Product sync cron started");
        fs.appendFileSync(LOG_FILE, `Cron job executing at: ${formattedDate}\n`);

        try {
          const { storedCount, updatedCount } = await updateProducts();
          const { parkedCount, inactiveCount } = await updateProductsNew();

          const updatedFormattedDate = new Date().toLocaleString("en-US", {
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

          fs.appendFileSync(LOG_FILE, `Products updated successfully at: ${updatedFormattedDate}\n`);

          await Cronjoblog.create({
            cron_job_start: `Cron job executing at: ${formattedDate}`,
            new_products: storedCount,
            total_products: updatedCount,
            parked_products: parkedCount,
            inactive_products: inactiveCount,
            cron_job_end: `Products updated successfully at: ${updatedFormattedDate}`,
          });

          logger.info({ storedCount, updatedCount, parkedCount, inactiveCount }, "Product sync completed");

          if (BACKEND_URL) {
            try {
              await axios.get(`${BACKEND_URL}/categories`);
              await axios.get(`${BACKEND_URL}/brands`);
            } catch (apiError) {
              logger.warn({ err: apiError }, "API refresh call failed");
            }
          }
        } catch (error) {
          logger.error({ err: error }, "Product sync cron failed");
          fs.appendFileSync(LOG_FILE, `Error updating products: ${error.message}\n`);
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
        try {
          await sendScheduledNotifications();
        } catch (error) {
          logger.error({ err: error }, "Scheduled notifications cron failed");
        }
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
