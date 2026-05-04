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

    it("returns populated items so the web optimistic update can read item.product._id (BUG-056 lock-in)", async () => {
      // Seed two items so we can verify the surviving item's product is populated.
      const otherProductId = new mongoose.Types.ObjectId().toString();
      const otherProduct = await Product.create({
        product: { id: "lsB", name: "Product B" },
        variantsData: [{ id: "vB", qty: 5, price: "20.00" }],
        totalQty: 5,
      });
      await Cart.create({
        user: userId,
        items: [cartItem(productId), cartItem(otherProduct._id.toString(), { variantId: "vB" })],
      });

      const result = await cartService.removeFromCart(userId, productId);

      expect(result.cartCount).toBe(1);
      expect(Array.isArray(result.cart)).toBe(true);
      // The surviving item's `product` must be a populated object with _id —
      // not a bare ObjectId string. Without this, the web's next mutation
      // sends product_id=undefined and the user can't delete the item.
      expect(result.cart[0].product).toEqual(expect.objectContaining({ _id: expect.anything() }));
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

// ---------------------------------------------------------------------------
// cartService — gift-with-purchase logic
//
// The gift logic is driven by a Product document with { isGift: true }.
// getGiftProductInfo() queries: Product.findOne({ isGift: true, status: true })
// Threshold defaults to AED 400 (GIFT_THRESHOLD_DEFAULT_AED) or
// product.giftThreshold if set.
// GIFT_MIN_STOCK = 5 — gift product must have totalQty >= 5 to be considered
// "in stock".
// ---------------------------------------------------------------------------
describe("cartService — gift-with-purchase logic", () => {
  let userId;
  let regularProductId;
  let giftProductId;

  const GIFT_THRESHOLD = 400; // matches GIFT_THRESHOLD_DEFAULT_AED in service

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();

    // Regular product priced at AED 100
    const regular = await Product.create({
      product: { name: "Regular Product", id: "reg-001", product_type_id: "cat-1" },
      variantsData: [{ id: "v1", name: "Default", qty: 20 }],
      totalQty: 20,
      status: true,
      discount: 0,
      originalPrice: 100,
      discountedPrice: 100,
    });
    regularProductId = regular._id.toString();

    // Gift product — isGift:true, sufficient stock (>= 5)
    const gift = await Product.create({
      product: { name: "Free Gift", id: "gift-001", product_type_id: "cat-gift" },
      variantsData: [{ id: "gv1", name: "Default", qty: 10 }],
      totalQty: 10,
      status: true,
      isGift: true,
      giftVariantId: "gv1",
      // giftThreshold omitted → defaults to AED 400
    });
    giftProductId = gift._id.toString();
  });

  it("subtotal BELOW threshold: giftEligible is false", async () => {
    // 3 × AED 100 = AED 300 < AED 400
    await Cart.create({
      user: userId,
      items: [cartItem(regularProductId, { quantity: 3, variantPrice: "100" })],
    });

    const result = await cartService.getCart(userId, { includeGiftLogic: true });

    expect(result.giftEligible).toBe(false);
    expect(result.cartSubtotal).toBe(300);
  });

  it("subtotal AT threshold: giftEligible is true", async () => {
    // 4 × AED 100 = AED 400 >= AED 400
    await Cart.create({
      user: userId,
      items: [cartItem(regularProductId, { quantity: 4, variantPrice: "100" })],
    });

    const result = await cartService.getCart(userId, { includeGiftLogic: true });

    expect(result.giftEligible).toBe(true);
    expect(result.cartSubtotal).toBe(400);
  });

  it("eligible and gift in stock: giftAdded is true and promoMessage mentions the gift", async () => {
    // 5 × AED 100 = AED 500 >= AED 400; gift has totalQty=10 (>= GIFT_MIN_STOCK=5)
    await Cart.create({
      user: userId,
      items: [cartItem(regularProductId, { quantity: 5, variantPrice: "100" })],
    });

    const result = await cartService.getCart(userId, { includeGiftLogic: true });

    expect(result.giftEligible).toBe(true);
    expect(result.giftAdded).toBe(true);
    expect(result.promoMessage).toMatch(/gift/i);
  });

  it("the free gift item added to cart has price '0' and isGiftWithPurchase true", async () => {
    await Cart.create({
      user: userId,
      items: [cartItem(regularProductId, { quantity: 5, variantPrice: "100" })],
    });

    const result = await cartService.getCart(userId, { includeGiftLogic: true });

    const giftInCart = result.cart.find((i) => i.isGiftWithPurchase === true);
    expect(giftInCart).toBeDefined();
    expect(giftInCart.price).toBe("0");
    expect(giftInCart.variantPrice).toBe("0");
    expect(giftInCart.isGiftWithPurchase).toBe(true);
  });

  it("includeGiftLogic: false does NOT add giftEligible / giftAdded fields", async () => {
    await Cart.create({
      user: userId,
      items: [cartItem(regularProductId, { quantity: 5, variantPrice: "100" })],
    });

    const result = await cartService.getCart(userId, { includeGiftLogic: false });

    expect(result.giftEligible).toBeUndefined();
    expect(result.giftAdded).toBeUndefined();
    expect(result.promoMessage).toBeUndefined();
    expect(result.cartSubtotal).toBeUndefined();
  });

  it("empty cart with includeGiftLogic: true returns giftEligible false and cartSubtotal 0", async () => {
    // No cart in DB at all
    const result = await cartService.getCart(userId, { includeGiftLogic: true });

    expect(result.giftEligible).toBe(false);
    expect(result.cartSubtotal).toBe(0);
    expect(result.giftAdded).toBe(false);
    expect(result.cart).toEqual([]);
  });
});
