require("../setup");
const mongoose = require("mongoose");
const WishlistRepository = require("../../src/repositories/WishlistRepository");

describe("WishlistRepository", () => {
  let repo;
  let userId;
  let altUserId;

  beforeEach(() => {
    repo = new WishlistRepository();
    userId = new mongoose.Types.ObjectId();
    altUserId = new mongoose.Types.ObjectId();
  });

  // ─── findForUser ──────────────────────────────────────────────────────────────

  describe("findForUser", () => {
    it("returns null when user has no wishlist", async () => {
      const result = await repo.findForUser(userId);
      expect(result).toBeNull();
    });

    it("returns lean doc by default", async () => {
      await repo.create({ user: userId, items: [] });
      const result = await repo.findForUser(userId);
      expect(result).not.toBeNull();
      expect(typeof result.save).toBe("undefined");
    });

    it("returns hydrated doc when lean: false", async () => {
      await repo.create({ user: userId, items: [] });
      const result = await repo.findForUser(userId, { lean: false });
      expect(typeof result.save).toBe("function");
    });

    it("does not return another user wishlist", async () => {
      await repo.create({ user: altUserId, items: [] });
      const result = await repo.findForUser(userId);
      expect(result).toBeNull();
    });
  });

  // ─── countItemsForUser ────────────────────────────────────────────────────────

  describe("countItemsForUser", () => {
    it("returns 0 when user has no wishlist", async () => {
      const count = await repo.countItemsForUser(new mongoose.Types.ObjectId());
      expect(count).toBe(0);
    });

    it("returns 0 for an empty wishlist", async () => {
      await repo.create({ user: userId, items: [] });
      const count = await repo.countItemsForUser(userId);
      expect(count).toBe(0);
    });

    it("returns correct count of items", async () => {
      const items = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
      ];
      await repo.create({ user: userId, items });
      const count = await repo.countItemsForUser(userId);
      expect(count).toBe(3);
    });

    it("handles wishlist with undefined items gracefully", async () => {
      // items defaults to [] but we want to test the fallback
      await repo.create({ user: userId, items: [] });
      const wl = await repo.findForUser(userId, { lean: false });
      wl.items = undefined; // simulate corrupted data
      await wl.save();

      const count = await repo.countItemsForUser(userId);
      // Should not throw, returns 0
      expect(count).toBe(0);
    });
  });
});
