require("../setup");
const mongoose = require("mongoose");
const cartService = require("../../src/services/cartService");
const Cart = require("../../src/models/Cart");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");

function cartItem(productId, overrides = {}) {
  return {
    product: productId,
    quantity: 1,
    variantId: "v1",
    variantName: "Default",
    variantPrice: "50",
    name: "Test Product",
    image: "test.jpg",
    originalPrice: "50",
    productId: "test-123",
    totalAvailableQty: "10",
    ...overrides,
  };
}

describe("cartService", () => {
  let userId;
  let productId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();

    const product = await Product.create({
      product: { name: "Test Product", id: "test-123", product_type_id: "cat-1" },
      variantsData: [{ id: "v1", name: "Default", qty: 10 }],
      totalQty: 10,
      status: true,
      discount: 0,
      originalPrice: 50,
      discountedPrice: 50,
    });
    productId = product._id.toString();
  });

  describe("getCart", () => {
    it("should return empty cart when no cart exists", async () => {
      const result = await cartService.getCart(userId, { includeGiftLogic: false });
      expect(result.cartCount).toBe(0);
      expect(result.cart).toEqual([]);
    });

    it("should return empty cart with gift info when includeGiftLogic is true", async () => {
      const result = await cartService.getCart(userId, { includeGiftLogic: true });
      expect(result.cartCount).toBe(0);
      expect(result.cart).toEqual([]);
      expect(result.cartSubtotal).toBe(0);
      expect(result.giftEligible).toBe(false);
    });

    it("should return cart items when cart exists", async () => {
      await Cart.create({
        user: userId,
        items: [cartItem(productId, { quantity: 2 })],
      });

      const result = await cartService.getCart(userId, { includeGiftLogic: false });
      expect(result.cartCount).toBe(1);
      expect(result.cart).toHaveLength(1);
    });
  });

  describe("addToCart", () => {
    it("should add item to new cart", async () => {
      const result = await cartService.addToCart(userId, {
        product_id: productId,
        qty: 2,
        variantId: "v1",
        variantName: "Default",
        variantPrice: "50",
        p_name: "Test Product",
        p_image: "test.jpg",
        p_originalPrice: "50",
        p_id: "test-123",
        p_totalAvailableQty: "10",
      });

      expect(result.cartCount).toBe(1);
      expect(result.cart[0].quantity).toBe(2);
    });

    it("should increase quantity for existing item", async () => {
      await Cart.create({
        user: userId,
        items: [cartItem(productId)],
      });

      const result = await cartService.addToCart(userId, {
        product_id: productId,
        qty: 2,
        variantId: "v1",
      });

      expect(result.cart[0].quantity).toBe(3);
    });

    it("should throw when product_id is missing", async () => {
      await expect(cartService.addToCart(userId, { qty: 1 })).rejects.toMatchObject({
        status: 400,
        message: "product_id is required",
      });
    });

    it("should throw when product not found", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(
        cartService.addToCart(userId, { product_id: fakeId, qty: 1, variantId: "v1" })
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it("should throw when quantity exceeds stock", async () => {
      await expect(
        cartService.addToCart(userId, {
          product_id: productId,
          qty: 20,
          variantId: "v1",
        })
      ).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe("removeFromCart", () => {
    it("should remove item from cart", async () => {
      await Cart.create({
        user: userId,
        items: [cartItem(productId)],
      });

      const result = await cartService.removeFromCart(userId, productId);
      expect(result.cartCount).toBe(0);
    });

    it("should throw when product not in cart", async () => {
      await Cart.create({ user: userId, items: [] });
      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(cartService.removeFromCart(userId, fakeId)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("should throw when product_id is missing", async () => {
      await expect(cartService.removeFromCart(userId, null)).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe("increaseQty", () => {
    it("should increase item quantity", async () => {
      await Cart.create({
        user: userId,
        items: [cartItem(productId, { quantity: 2 })],
      });

      const result = await cartService.increaseQty(userId, productId, 3);
      expect(result.cart[0].quantity).toBe(5);
    });

    it("should throw when exceeding available quantity with validation", async () => {
      await Cart.create({
        user: userId,
        items: [cartItem(productId, { quantity: 8 })],
      });

      await expect(
        cartService.increaseQty(userId, productId, 5, { validateAvailableQty: true })
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("decreaseQty", () => {
    it("should decrease item quantity", async () => {
      await Cart.create({
        user: userId,
        items: [cartItem(productId, { quantity: 5 })],
      });

      const result = await cartService.decreaseQty(userId, productId, 2);
      expect(result.cart[0].quantity).toBe(3);
      expect(result.message).toBe("Quantity decreased by 2");
    });

    it("should remove item when quantity would go to zero", async () => {
      await Cart.create({
        user: userId,
        items: [cartItem(productId)],
      });

      const result = await cartService.decreaseQty(userId, productId, 1);
      expect(result.cart).toHaveLength(0);
      expect(result.message).toBe("Product removed from cart");
    });
  });
});
