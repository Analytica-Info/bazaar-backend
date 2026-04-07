require("../setup");
const mongoose = require("mongoose");
const Wishlist = require("../../src/models/Wishlist");
const Product = require("../../src/models/Product");

describe("Wishlist Model", () => {
  let userId;
  let productId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();
    const product = await Product.create({
      product: { name: "Test Product", id: "test-123" },
      variantsData: [],
      totalQty: 10,
      status: true,
      discountedPrice: 50,
    });
    productId = product._id;
  });

  it("should create a wishlist with items", async () => {
    const wishlist = await Wishlist.create({
      user: userId,
      items: [productId],
    });

    expect(wishlist.user.toString()).toBe(userId.toString());
    expect(wishlist.items).toHaveLength(1);
  });

  it("should add product to existing wishlist", async () => {
    const wishlist = await Wishlist.create({
      user: userId,
      items: [productId],
    });

    const product2 = await Product.create({
      product: { name: "Product 2", id: "test-456" },
      variantsData: [],
      totalQty: 5,
      status: true,
      discountedPrice: 30,
    });

    wishlist.items.push(product2._id);
    await wishlist.save();

    const updated = await Wishlist.findById(wishlist._id);
    expect(updated.items).toHaveLength(2);
  });

  it("should remove product from wishlist", async () => {
    const wishlist = await Wishlist.create({
      user: userId,
      items: [productId],
    });

    wishlist.items = wishlist.items.filter(
      (id) => id.toString() !== productId.toString()
    );
    await wishlist.save();

    const updated = await Wishlist.findById(wishlist._id);
    expect(updated.items).toHaveLength(0);
  });

  it("should enforce unique user constraint", async () => {
    await Wishlist.create({ user: userId, items: [] });

    await expect(
      Wishlist.create({ user: userId, items: [] })
    ).rejects.toThrow();
  });
});
