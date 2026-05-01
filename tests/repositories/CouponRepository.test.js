require("../setup");
const mongoose = require("mongoose");
const CouponRepository = require("../../src/repositories/CouponRepository");

let cCounter = 0;
function makeCoupon(overrides = {}) {
  cCounter += 1;
  return {
    coupon: `COUPON-${Date.now()}-${cCounter}`,
    phone: `+971501${String(cCounter).padStart(6, "0")}`,
    status: "unused",
    ...overrides,
  };
}

describe("CouponRepository", () => {
  let repo;

  beforeEach(() => {
    repo = new CouponRepository();
  });

  // ─── findByPhone ─────────────────────────────────────────────────────────────

  describe("findByPhone", () => {
    it("returns null when phone is falsy (null guard)", async () => {
      expect(await repo.findByPhone(null)).toBeNull();
      expect(await repo.findByPhone(undefined)).toBeNull();
      expect(await repo.findByPhone("")).toBeNull();
    });

    it("finds a coupon by phone", async () => {
      const c = await repo.create(makeCoupon({ phone: "+971501000001" }));
      const found = await repo.findByPhone("+971501000001");
      expect(found).not.toBeNull();
      expect(found.coupon).toBe(c.coupon);
    });

    it("returns null when phone has no coupon", async () => {
      const found = await repo.findByPhone("+971599999999");
      expect(found).toBeNull();
    });

    it("returns lean doc by default", async () => {
      await repo.create(makeCoupon({ phone: "+971501000002" }));
      const found = await repo.findByPhone("+971501000002");
      expect(typeof found.save).toBe("undefined");
    });

    it("returns hydrated doc when lean: false", async () => {
      await repo.create(makeCoupon({ phone: "+971501000003" }));
      const found = await repo.findByPhone("+971501000003", { lean: false });
      expect(typeof found.save).toBe("function");
    });
  });

  // ─── basic CRUD via BaseRepository ────────────────────────────────────────────

  describe("coupon uniqueness constraint", () => {
    it("rejects duplicate coupon codes", async () => {
      await repo.create(makeCoupon({ coupon: "DUPLICATE-CODE" }));
      await expect(repo.create(makeCoupon({ coupon: "DUPLICATE-CODE" }))).rejects.toThrow();
    });
  });

  describe("status filter via find", () => {
    it("can filter by status=unused", async () => {
      await repo.create(makeCoupon({ status: "unused" }));
      await repo.create(makeCoupon({ status: "used" }));
      const results = await repo.find({ status: "unused" });
      expect(results.every((c) => c.status === "unused")).toBe(true);
    });

    it("can filter by status=used", async () => {
      await repo.create(makeCoupon({ status: "used" }));
      const results = await repo.find({ status: "used" });
      expect(results).toHaveLength(1);
    });
  });
});
