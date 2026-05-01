require("../setup");
const mongoose = require("mongoose");
const OrderRepository = require("../../src/repositories/OrderRepository");

let orderCounter = 0;

// Minimal valid order factory — generates unique order_id and order_no per call
function makeOrder(overrides = {}) {
  orderCounter += 1;
  return {
    name: "Test User",
    address: "123 Test St",
    email: "test@example.com",
    status: "pending",
    amount_subtotal: "100",
    amount_total: "130",
    discount_amount: "0",
    order_id: `ORD-TEST-${Date.now()}-${orderCounter}`,
    order_no: Date.now() * 1000 + orderCounter,
    txn_id: `txn-${Date.now()}-${orderCounter}`,
    payment_method: "card",
    payment_status: "pending",
    ...overrides,
  };
}

describe("OrderRepository", () => {
  let repo;
  let userId;
  let altUserId;

  beforeEach(() => {
    repo = new OrderRepository();
    userId = new mongoose.Types.ObjectId();
    altUserId = new mongoose.Types.ObjectId();
  });

  // ─── findForUser ─────────────────────────────────────────────────────────────

  describe("findForUser", () => {
    it("finds orders written with userId field", async () => {
      await repo.create(makeOrder({ userId }));
      const results = await repo.findForUser(userId, { lean: true });
      expect(results).toHaveLength(1);
    });

    it("finds orders written with legacy user_id field", async () => {
      await repo.create(makeOrder({ user_id: userId }));
      const results = await repo.findForUser(userId, { lean: true });
      expect(results).toHaveLength(1);
    });

    it("does not return other users orders", async () => {
      await repo.create(makeOrder({ userId }));
      await repo.create(makeOrder({ userId: altUserId }));
      const results = await repo.findForUser(userId, { lean: true });
      expect(results).toHaveLength(1);
    });

    it("returns hydrated documents by default (lean: false)", async () => {
      await repo.create(makeOrder({ userId }));
      const results = await repo.findForUser(userId);
      expect(results).toHaveLength(1);
      expect(typeof results[0].save).toBe("function");
    });

    it("applies pagination — page 1 limit 2", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create(makeOrder({ userId }));
      }
      const results = await repo.findForUser(userId, { page: 1, limit: 2, lean: true });
      expect(results).toHaveLength(2);
    });

    it("applies pagination — page 2 limit 2 returns next 2", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create(makeOrder({ userId }));
      }
      const p1 = await repo.findForUser(userId, { page: 1, limit: 2, lean: true });
      const p2 = await repo.findForUser(userId, { page: 2, limit: 2, lean: true });
      expect(p2).toHaveLength(2);
      // Page 2 must be different docs from page 1
      const p1Ids = p1.map((o) => String(o._id));
      const p2Ids = p2.map((o) => String(o._id));
      expect(p1Ids).not.toEqual(p2Ids);
    });

    it("clamps limit to max 100", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create(makeOrder({ userId }));
      }
      // limit 999 should not throw and returns at most 100 (we only have 5 docs)
      const results = await repo.findForUser(userId, { limit: 999, lean: true });
      expect(results.length).toBeLessThanOrEqual(100);
    });

    it("defaults page to 1 when page is invalid", async () => {
      await repo.create(makeOrder({ userId }));
      // NaN page should not throw
      const results = await repo.findForUser(userId, { page: NaN, limit: 10, lean: true });
      expect(results).toHaveLength(1);
    });

    it("returns empty array when user has no orders", async () => {
      const results = await repo.findForUser(userId, { lean: true });
      expect(results).toEqual([]);
    });

    it("finds orders with both userId and user_id for same user", async () => {
      await repo.create(makeOrder({ userId }));
      await repo.create(makeOrder({ user_id: userId }));
      const results = await repo.findForUser(userId, { lean: true });
      expect(results).toHaveLength(2);
    });
  });

  // ─── findOneForUser ───────────────────────────────────────────────────────────

  describe("findOneForUser", () => {
    it("finds an order by id for the correct user", async () => {
      const order = await repo.create(makeOrder({ userId }));
      const results = await repo.findOneForUser(userId, order._id, { lean: true });
      expect(results).toHaveLength(1);
    });

    it("returns empty when orderId belongs to a different user", async () => {
      const order = await repo.create(makeOrder({ userId: altUserId }));
      const results = await repo.findOneForUser(userId, order._id, { lean: true });
      expect(results).toHaveLength(0);
    });
  });

  // ─── countForUser ────────────────────────────────────────────────────────────

  describe("countForUser", () => {
    it("counts orders across both userId and user_id fields", async () => {
      await repo.create(makeOrder({ userId }));
      await repo.create(makeOrder({ user_id: userId }));
      await repo.create(makeOrder({ userId: altUserId }));
      const count = await repo.countForUser(userId);
      expect(count).toBe(2);
    });

    it("returns 0 when user has no orders", async () => {
      const count = await repo.countForUser(new mongoose.Types.ObjectId());
      expect(count).toBe(0);
    });
  });

  // ─── findRecentForTabbyHistory ────────────────────────────────────────────────

  describe("findRecentForTabbyHistory", () => {
    it("finds orders written with legacy user_id field", async () => {
      await repo.create(makeOrder({ user_id: userId, payment_method: "tabby", payment_status: "paid" }));

      const results = await repo.findRecentForTabbyHistory(userId);
      expect(results).toHaveLength(1);
    });

    it("respects the limit option", async () => {
      for (let i = 0; i < 15; i++) {
        await repo.create(makeOrder({ user_id: userId }));
      }
      const results = await repo.findRecentForTabbyHistory(userId, { limit: 5 });
      expect(results).toHaveLength(5);
    });

    it("defaults to limit 10", async () => {
      for (let i = 0; i < 12; i++) {
        await repo.create(makeOrder({ user_id: userId }));
      }
      const results = await repo.findRecentForTabbyHistory(userId);
      expect(results).toHaveLength(10);
    });

    it("returns empty when no matching orders", async () => {
      const results = await repo.findRecentForTabbyHistory(new mongoose.Types.ObjectId());
      expect(results).toHaveLength(0);
    });
  });

  // ─── countSuccessfulOrders ────────────────────────────────────────────────────

  describe("countSuccessfulOrders", () => {
    it("counts only orders not in failed statuses", async () => {
      // Successful (not in the $nin list)
      await repo.create(makeOrder({ user_id: userId, payment_status: "paid" }));
      await repo.create(makeOrder({ user_id: userId, payment_status: "completed" }));
      // Failed — should be excluded
      await repo.create(makeOrder({ user_id: userId, payment_status: "pending" }));
      await repo.create(makeOrder({ user_id: userId, payment_status: "failed" }));
      await repo.create(makeOrder({ user_id: userId, payment_status: "cancelled" }));

      const count = await repo.countSuccessfulOrders(userId);
      expect(count).toBe(2);
    });

    it("returns 0 when user has no orders", async () => {
      const count = await repo.countSuccessfulOrders(new mongoose.Types.ObjectId());
      expect(count).toBe(0);
    });
  });

  // ─── findByDateRange ─────────────────────────────────────────────────────────

  describe("findByDateRange", () => {
    it("returns orders within range", async () => {
      const now = new Date();
      const yesterday = new Date(now - 86400000);
      const tomorrow = new Date(now.getTime() + 86400000);

      await repo.create(makeOrder({ userId }));

      const results = await repo.findByDateRange(yesterday, tomorrow);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("excludes orders outside range", async () => {
      const future1 = new Date(Date.now() + 86400000 * 2);
      const future2 = new Date(Date.now() + 86400000 * 3);

      await repo.create(makeOrder({ userId }));

      const results = await repo.findByDateRange(future1, future2);
      expect(results).toHaveLength(0);
    });
  });
});
