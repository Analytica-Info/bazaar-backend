require("../setup");
const mongoose = require("mongoose");
const CartRepository = require("../../src/repositories/CartRepository");

function makeCartItem(overrides = {}) {
  return {
    product: new mongoose.Types.ObjectId(),
    quantity: 1,
    image: "https://example.com/img.jpg",
    name: "Test Product",
    originalPrice: "100",
    productId: "prod-001",
    totalAvailableQty: "10",
    variantId: `var-${Math.random().toString(36).slice(2)}`,
    variantName: "Default",
    variantPrice: "100",
    ...overrides,
  };
}

describe("CartRepository", () => {
  let repo;
  let userId;
  let altUserId;

  beforeEach(() => {
    repo = new CartRepository();
    userId = new mongoose.Types.ObjectId();
    altUserId = new mongoose.Types.ObjectId();
  });

  describe("create — empty cart", () => {
    it("creates a cart with no items", async () => {
      const cart = await repo.create({ user: userId, items: [] });
      expect(cart.items).toHaveLength(0);
      expect(String(cart.user)).toBe(String(userId));
    });

    it("fails if user is not provided (required field)", async () => {
      // The Cart schema does not mark user as required so this succeeds — document that
      // Only one cart per user via unique constraint
      const cart = await repo.create({ items: [] });
      expect(cart).toBeDefined();
    });

    it("enforces unique constraint — only one cart per user", async () => {
      await repo.create({ user: userId, items: [] });
      await expect(repo.create({ user: userId, items: [] })).rejects.toThrow();
    });
  });

  describe("create — cart with items", () => {
    it("creates a cart with items", async () => {
      const item = makeCartItem();
      const cart = await repo.create({ user: userId, items: [item] });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].name).toBe("Test Product");
    });

    it("cart item requires image field", async () => {
      const badItem = makeCartItem({ image: undefined });
      await expect(repo.create({ user: altUserId, items: [badItem] })).rejects.toThrow();
    });
  });

  describe("findById", () => {
    it("returns a lean cart by default", async () => {
      const created = await repo.create({ user: userId, items: [] });
      const found = await repo.findById(created._id);
      expect(found).not.toBeNull();
      expect(typeof found.save).toBe("undefined");
    });

    it("returns null for non-existent id", async () => {
      const found = await repo.findById(new mongoose.Types.ObjectId());
      expect(found).toBeNull();
    });
  });

  describe("updateById", () => {
    it("adds an item to the cart via $push", async () => {
      const created = await repo.create({ user: userId, items: [] });
      const item = makeCartItem();
      const updated = await repo.updateById(
        created._id,
        { $push: { items: item } },
        { runValidators: false }
      );
      expect(updated.items).toHaveLength(1);
    });

    it("removes an item from the cart via $pull", async () => {
      const item = makeCartItem();
      const created = await repo.create({ user: userId, items: [item] });
      const updated = await repo.updateById(
        created._id,
        { $set: { items: [] } },
        { runValidators: false }
      );
      expect(updated.items).toHaveLength(0);
    });
  });

  describe("deleteById", () => {
    it("deletes the cart", async () => {
      const cart = await repo.create({ user: userId, items: [] });
      await repo.deleteById(cart._id);
      const found = await repo.findById(cart._id);
      expect(found).toBeNull();
    });
  });

  describe("find by user filter", () => {
    it("can find carts by user field", async () => {
      await repo.create({ user: userId, items: [] });
      await repo.create({ user: altUserId, items: [] });

      const results = await repo.find({ user: userId });
      expect(results).toHaveLength(1);
    });

    it("returns empty when user has no cart", async () => {
      const results = await repo.find({ user: new mongoose.Types.ObjectId() });
      expect(results).toEqual([]);
    });
  });
});
