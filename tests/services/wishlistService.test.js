require("../setup");
const mongoose = require("mongoose");
const wishlistService = require("../../src/services/wishlistService");
const Wishlist = require("../../src/models/Wishlist");
const Product = require("../../src/models/Product");

describe("wishlistService", () => {
  let userId;
  let productId1;
  let productId2;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();

    const p1 = await Product.create({
      product: { name: "Product 1", id: "p1" },
      totalQty: 5,
      status: true,
      originalPrice: 100,
      discountedPrice: 100,
    });
    const p2 = await Product.create({
      product: { name: "Product 2", id: "p2" },
      totalQty: 5,
      status: true,
      originalPrice: 200,
      discountedPrice: 200,
    });
    productId1 = p1._id;
    productId2 = p2._id;
  });

  describe("getWishlist", () => {
    it("should return empty wishlist when none exists", async () => {
      const result = await wishlistService.getWishlist(userId);
      expect(result.wishlistCount).toBe(0);
      expect(result.wishlist).toEqual([]);
    });

    it("should return populated wishlist when items exist", async () => {
      await Wishlist.create({ user: userId, items: [productId1, productId2] });

      const result = await wishlistService.getWishlist(userId);
      expect(result.wishlistCount).toBe(2);
      expect(result.wishlist).toHaveLength(2);
    });
  });

  describe("addToWishlist", () => {
    it("should create a new wishlist when none exists", async () => {
      const result = await wishlistService.addToWishlist(userId, productId1.toString());

      expect(result.wishlist).toBeDefined();
      const saved = await Wishlist.findOne({ user: userId });
      expect(saved.items).toHaveLength(1);
      expect(saved.items[0].toString()).toBe(productId1.toString());
    });

    it("should add to existing wishlist", async () => {
      await Wishlist.create({ user: userId, items: [productId1] });

      await wishlistService.addToWishlist(userId, productId2.toString());

      const saved = await Wishlist.findOne({ user: userId });
      expect(saved.items).toHaveLength(2);
    });

    it("should throw when product already in wishlist", async () => {
      await Wishlist.create({ user: userId, items: [productId1] });

      try {
        await wishlistService.addToWishlist(userId, productId1.toString());
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already/i);
      }
    });

    it("should throw when productId is missing", async () => {
      try {
        await wishlistService.addToWishlist(userId, undefined);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });
  });

  describe("removeFromWishlist", () => {
    it("should remove an item from the wishlist", async () => {
      await Wishlist.create({ user: userId, items: [productId1, productId2] });

      await wishlistService.removeFromWishlist(userId, productId1.toString());

      const saved = await Wishlist.findOne({ user: userId });
      expect(saved.items).toHaveLength(1);
      expect(saved.items[0].toString()).toBe(productId2.toString());
    });
  });
});
