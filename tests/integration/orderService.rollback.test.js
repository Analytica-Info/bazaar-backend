/**
 * Integration: UnitOfWork rollback semantics
 *
 * MongoMemoryServer does not support replica set mode by default so true
 * ACID transactions are unavailable. UnitOfWork detects this and falls back
 * to running the callback without a session.  These tests verify:
 *
 *  1. When the callback throws, subsequent reads reflect NO partial writes
 *     (the test controls what was persisted before the throw).
 *  2. The UnitOfWork propagates the error to the caller.
 *  3. Writes that succeed before the throw are NOT implicitly rolled back by
 *     UnitOfWork in non-transactional mode — which is the documented limitation.
 *     Tests document this explicitly so regressions are caught if transactions
 *     are enabled later.
 */

require("../setup");
const mongoose = require("mongoose");
const unitOfWork = require("../../src/repositories/UnitOfWork");
const CartRepository = require("../../src/repositories/CartRepository");

// ─── Factories ────────────────────────────────────────────────────────────────

function makeUserId() {
  return new mongoose.Types.ObjectId();
}

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("UnitOfWork rollback semantics (non-transactional fallback)", () => {
  let cartRepo;

  beforeEach(() => {
    cartRepo = new CartRepository();
  });

  it("propagates errors thrown inside the callback to the caller", async () => {
    const sentinel = new Error("payment recording failed");

    await expect(
      unitOfWork.runInTransaction(async () => {
        throw sentinel;
      })
    ).rejects.toThrow("payment recording failed");
  });

  it("does not persist cart when callback throws before save completes", async () => {
    const userId = makeUserId();

    // Simulate a mid-flight failure: callback throws synchronously before any
    // model write is issued.
    await expect(
      unitOfWork.runInTransaction(async (_session) => {
        // Pretend we validated inventory then the payment call failed
        const paymentError = Object.assign(new Error("Stripe unavailable"), { statusCode: 503 });
        throw paymentError;
      })
    ).rejects.toThrow("Stripe unavailable");

    // Nothing was written
    const cart = await cartRepo.model.findOne({ user: userId }).lean();
    expect(cart).toBeNull();
  });

  it("documents non-transactional limitation: cart writes before throw are NOT rolled back", async () => {
    // This test intentionally documents the known limitation: without a replica
    // set, UnitOfWork cannot roll back writes that already hit Mongo.
    // If this test FAILS in the future it means transactions are now available
    // and the limitation no longer applies — update accordingly.
    const userId = makeUserId();
    const item = makeCartItem();

    await expect(
      unitOfWork.runInTransaction(async (_session) => {
        // First write succeeds (cart creation)
        await cartRepo.model.create({ user: userId, items: [item] });
        // Subsequent operation fails (e.g. payment recording)
        throw new Error("payment gateway timeout");
      })
    ).rejects.toThrow("payment gateway timeout");

    // In non-transactional mode the cart DOES exist (limitation documented)
    const cart = await cartRepo.model.findOne({ user: userId }).lean();
    expect(cart).not.toBeNull();
  });

  it("does not decrement cart when callback throws before cart clear", async () => {
    const userId = makeUserId();

    // Seed a cart with one item
    const item = makeCartItem();
    await cartRepo.model.create({ user: userId, items: [item] });

    await expect(
      unitOfWork.runInTransaction(async () => {
        // Simulate failing before cart clear step
        throw new Error("inventory update failed");
      })
    ).rejects.toThrow("inventory update failed");

    // Cart must still have the item
    const cart = await cartRepo.model.findOne({ user: userId }).lean();
    expect(cart).not.toBeNull();
    expect(cart.items).toHaveLength(1);
  });

  it("runInTransaction resolves and returns callback return value on success", async () => {
    const result = await unitOfWork.runInTransaction(async () => {
      return { ok: true, value: 42 };
    });
    expect(result).toEqual({ ok: true, value: 42 });
  });
});
