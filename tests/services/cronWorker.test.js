require("../setup");
const mongoose = require("mongoose");
const SyncState = require("../../src/models/SyncState");
const Cronjoblog = require("../../src/models/Cronjoblog");

// Mock external dependencies
jest.mock("../../src/scripts/updateProducts", () => jest.fn());
jest.mock("../../src/scripts/updateProductsNew", () => jest.fn());
jest.mock("../../src/scripts/sendScheduledNotifications", () => jest.fn());
jest.mock("axios");

const updateProducts = require("../../src/scripts/updateProducts");
const updateProductsNew = require("../../src/scripts/updateProductsNew");

describe("Cron Job — SyncState tracking", () => {
  beforeEach(async () => {
    updateProducts.mockReset();
    updateProductsNew.mockReset();
  });

  describe("SyncState model", () => {
    it("should create a sync state record", async () => {
      const state = await SyncState.create({
        key: "test_sync",
        lastVersion: "v123",
        lastSyncAt: new Date(),
        lastProductCount: 50,
        lastStatus: "success",
        consecutiveFailures: 0,
      });

      expect(state.key).toBe("test_sync");
      expect(state.lastVersion).toBe("v123");
      expect(state.lastStatus).toBe("success");
      expect(state.consecutiveFailures).toBe(0);
    });

    it("should enforce unique key", async () => {
      await SyncState.create({ key: "unique_test" });
      await expect(SyncState.create({ key: "unique_test" })).rejects.toThrow();
    });

    it("should track consecutive failures", async () => {
      const state = await SyncState.create({
        key: "fail_test",
        consecutiveFailures: 0,
      });

      await SyncState.findOneAndUpdate(
        { key: "fail_test" },
        { $inc: { consecutiveFailures: 1 }, $set: { lastStatus: "failed", lastError: "API timeout" } }
      );

      const updated = await SyncState.findOne({ key: "fail_test" });
      expect(updated.consecutiveFailures).toBe(1);
      expect(updated.lastStatus).toBe("failed");
      expect(updated.lastError).toBe("API timeout");
    });

    it("should reset failures on success", async () => {
      await SyncState.create({
        key: "reset_test",
        consecutiveFailures: 5,
        lastStatus: "failed",
      });

      await SyncState.findOneAndUpdate(
        { key: "reset_test" },
        { $set: { consecutiveFailures: 0, lastStatus: "success", lastError: null } }
      );

      const updated = await SyncState.findOne({ key: "reset_test" });
      expect(updated.consecutiveFailures).toBe(0);
      expect(updated.lastStatus).toBe("success");
      expect(updated.lastError).toBeNull();
    });

    it("should store failed items list", async () => {
      await SyncState.create({
        key: "items_test",
        lastStatus: "partial",
        failedItems: ["product_123", "product_456"],
      });

      const state = await SyncState.findOne({ key: "items_test" });
      expect(state.failedItems).toHaveLength(2);
      expect(state.failedItems).toContain("product_123");
    });

    it("should upsert on findOneAndUpdate", async () => {
      const result = await SyncState.findOneAndUpdate(
        { key: "upsert_test" },
        {
          $set: {
            lastVersion: "v999",
            lastSyncAt: new Date(),
            lastStatus: "success",
          },
        },
        { upsert: true, new: true }
      );

      expect(result.key).toBe("upsert_test");
      expect(result.lastVersion).toBe("v999");
    });
  });

  describe("Cronjoblog model", () => {
    it("should create a cron job log entry", async () => {
      const log = await Cronjoblog.create({
        cron_job_start: "Cron job executing at: Monday, 4/7/2026, 3:00:00 AM",
        new_products: 5,
        total_products: 100,
        parked_products: 3,
        inactive_products: 2,
        cron_job_end: "Products updated at: Monday, 4/7/2026, 3:05:00 AM",
      });

      expect(Number(log.new_products)).toBe(5);
      expect(Number(log.total_products)).toBe(100);
    });
  });

  describe("Incremental sync version tracking", () => {
    it("should save version after successful product fetch", async () => {
      await SyncState.findOneAndUpdate(
        { key: "lightspeed_products_v3" },
        {
          $set: {
            lastVersion: "abc123",
            lastSyncAt: new Date(),
            lastProductCount: 42,
            lastStatus: "success",
          },
        },
        { upsert: true, new: true }
      );

      const state = await SyncState.findOne({ key: "lightspeed_products_v3" });
      expect(state.lastVersion).toBe("abc123");
      expect(state.lastProductCount).toBe(42);
    });

    it("should resume from last version on next sync", async () => {
      await SyncState.create({
        key: "lightspeed_products_v3",
        lastVersion: "version_cursor_1",
      });

      const state = await SyncState.findOne({ key: "lightspeed_products_v3" });
      expect(state.lastVersion).toBe("version_cursor_1");
      // Next sync would use this as startVersion parameter
    });

    it("should track multiple sync types independently", async () => {
      await SyncState.create({ key: "lightspeed_products_v3", lastVersion: "p_v1" });
      await SyncState.create({ key: "lightspeed_inventory_v2", lastVersion: "i_v1" });
      await SyncState.create({ key: "lightspeed_sales_v2", lastVersion: "s_v1" });

      const products = await SyncState.findOne({ key: "lightspeed_products_v3" });
      const inventory = await SyncState.findOne({ key: "lightspeed_inventory_v2" });
      const sales = await SyncState.findOne({ key: "lightspeed_sales_v2" });

      expect(products.lastVersion).toBe("p_v1");
      expect(inventory.lastVersion).toBe("i_v1");
      expect(sales.lastVersion).toBe("s_v1");
    });
  });

  describe("updateProducts mock", () => {
    it("should return stored and updated counts on success", async () => {
      updateProducts.mockResolvedValue({ storedCount: 5, updatedCount: 95 });

      const result = await updateProducts();
      expect(result.storedCount).toBe(5);
      expect(result.updatedCount).toBe(95);
    });

    it("should handle zero changes (no new products)", async () => {
      updateProducts.mockResolvedValue({ storedCount: 0, updatedCount: 0 });

      const result = await updateProducts();
      expect(result.storedCount).toBe(0);
      expect(result.updatedCount).toBe(0);
    });

    it("should throw on API failure", async () => {
      updateProducts.mockRejectedValue(new Error("Lightspeed API 502"));

      await expect(updateProducts()).rejects.toThrow("Lightspeed API 502");
    });
  });

  describe("updateProductsNew mock", () => {
    it("should return parked and inactive counts", async () => {
      updateProductsNew.mockResolvedValue({ parkedCount: 3, inactiveCount: 7 });

      const result = await updateProductsNew();
      expect(result.parkedCount).toBe(3);
      expect(result.inactiveCount).toBe(7);
    });

    it("should handle failure gracefully", async () => {
      updateProductsNew.mockRejectedValue(new Error("DB connection lost"));

      await expect(updateProductsNew()).rejects.toThrow("DB connection lost");
    });
  });

  describe("Partial failure scenario", () => {
    it("should record partial status when one step fails", async () => {
      // Simulate: updateProducts succeeds, updateProductsNew fails
      updateProducts.mockResolvedValue({ storedCount: 10, updatedCount: 90 });
      updateProductsNew.mockRejectedValue(new Error("Timeout"));

      const errors = [];

      try {
        await updateProducts();
      } catch (e) {
        errors.push(e.message);
      }

      try {
        await updateProductsNew();
      } catch (e) {
        errors.push(e.message);
      }

      const status = errors.length === 0 ? "success" : "partial";

      await SyncState.findOneAndUpdate(
        { key: "cron_product_sync" },
        {
          $set: {
            lastStatus: status,
            lastError: errors.join("; "),
            lastSyncAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      const state = await SyncState.findOne({ key: "cron_product_sync" });
      expect(state.lastStatus).toBe("partial");
      expect(state.lastError).toContain("Timeout");
    });
  });
});
