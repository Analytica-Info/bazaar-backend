require("../setup");
const mongoose = require("mongoose");
const UserRepository = require("../../src/repositories/UserRepository");

let uCounter = 0;
function makeUser(overrides = {}) {
  uCounter += 1;
  return {
    name: `User ${uCounter}`,
    email: `user${uCounter}-${Date.now()}@example.com`,
    role: "user",
    authProvider: "local",
    ...overrides,
  };
}

describe("UserRepository", () => {
  let repo;

  beforeEach(() => {
    repo = new UserRepository();
  });

  // ─── allExist ────────────────────────────────────────────────────────────────

  describe("allExist", () => {
    it("returns true for empty array", async () => {
      expect(await repo.allExist([])).toBe(true);
    });

    it("returns true when all ids exist", async () => {
      const u1 = await repo.create(makeUser());
      const u2 = await repo.create(makeUser());
      expect(await repo.allExist([u1._id, u2._id])).toBe(true);
    });

    it("returns false when one id does not exist", async () => {
      const u = await repo.create(makeUser());
      const ghost = new mongoose.Types.ObjectId();
      expect(await repo.allExist([u._id, ghost])).toBe(false);
    });

    it("returns false for an array of all non-existent ids", async () => {
      const ghost = new mongoose.Types.ObjectId();
      expect(await repo.allExist([ghost])).toBe(false);
    });

    it("returns true for non-array (null) input", async () => {
      // Guard clause: !Array.isArray returns true
      expect(await repo.allExist(null)).toBe(true);
    });
  });

  // ─── countAll ────────────────────────────────────────────────────────────────

  describe("countAll", () => {
    it("returns 0 when no users", async () => {
      expect(await repo.countAll()).toBe(0);
    });

    it("increments with each user added", async () => {
      await repo.create(makeUser());
      expect(await repo.countAll()).toBe(1);
      await repo.create(makeUser());
      expect(await repo.countAll()).toBe(2);
    });
  });

  // ─── findByIdsCapped ─────────────────────────────────────────────────────────

  describe("findByIdsCapped", () => {
    it("returns empty array for empty ids", async () => {
      const result = await repo.findByIdsCapped([]);
      expect(result).toEqual([]);
    });

    it("returns empty array for null input", async () => {
      const result = await repo.findByIdsCapped(null);
      expect(result).toEqual([]);
    });

    it("returns matching users", async () => {
      const u = await repo.create(makeUser());
      const result = await repo.findByIdsCapped([u._id]);
      expect(result).toHaveLength(1);
    });

    it("respects the limit option", async () => {
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const u = await repo.create(makeUser());
        ids.push(u._id);
      }
      const result = await repo.findByIdsCapped(ids, { limit: 2 });
      expect(result).toHaveLength(2);
    });
  });

  // ─── findExcludingIdsCapped ───────────────────────────────────────────────────

  describe("findExcludingIdsCapped", () => {
    it("excludes the specified ids", async () => {
      const u1 = await repo.create(makeUser());
      const u2 = await repo.create(makeUser());

      const result = await repo.findExcludingIdsCapped([u1._id]);
      const ids = result.map((u) => String(u._id));
      expect(ids).not.toContain(String(u1._id));
      expect(ids).toContain(String(u2._id));
    });

    it("respects the limit", async () => {
      for (let i = 0; i < 5; i++) await repo.create(makeUser());
      const result = await repo.findExcludingIdsCapped([], { limit: 2 });
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  // ─── searchPaginated ─────────────────────────────────────────────────────────

  describe("searchPaginated", () => {
    it("returns all users when no regex provided", async () => {
      await repo.create(makeUser());
      await repo.create(makeUser());
      const { items, total } = await repo.searchPaginated({ regexSafe: null, page: 1, limit: 10 });
      expect(total).toBe(2);
      expect(items).toHaveLength(2);
    });

    it("filters by name regex", async () => {
      await repo.create(makeUser({ name: "Alice Wonderland" }));
      await repo.create(makeUser({ name: "Bob Builder" }));
      const { items, total } = await repo.searchPaginated({ regexSafe: "alice", page: 1, limit: 10 });
      expect(total).toBe(1);
      expect(items[0].name).toMatch(/alice/i);
    });

    it("applies pagination correctly", async () => {
      for (let i = 0; i < 5; i++) await repo.create(makeUser());
      const { items, total } = await repo.searchPaginated({ regexSafe: null, page: 2, limit: 2 });
      expect(total).toBe(5);
      expect(items).toHaveLength(2);
    });

    it("returns empty page when beyond last page", async () => {
      await repo.create(makeUser());
      const { items, total } = await repo.searchPaginated({ regexSafe: null, page: 10, limit: 5 });
      expect(total).toBe(1);
      expect(items).toHaveLength(0);
    });
  });

  // ─── findProfileFields ────────────────────────────────────────────────────────

  describe("findProfileFields", () => {
    it("returns selected fields", async () => {
      const u = await repo.create(makeUser());
      const profile = await repo.findProfileFields(u._id);
      expect(profile).not.toBeNull();
      expect(profile.email).toBeDefined();
      expect(profile.name).toBeDefined();
    });

    it("returns null for non-existent user", async () => {
      const profile = await repo.findProfileFields(new mongoose.Types.ObjectId());
      expect(profile).toBeNull();
    });
  });

  // ─── listForNotificationTargeting ────────────────────────────────────────────

  describe("listForNotificationTargeting", () => {
    it("returns users sorted by name", async () => {
      await repo.create(makeUser({ name: "Zara" }));
      await repo.create(makeUser({ name: "Aaron" }));
      const result = await repo.listForNotificationTargeting();
      expect(result[0].name).toBe("Aaron");
      expect(result[1].name).toBe("Zara");
    });

    it("respects the limit option", async () => {
      for (let i = 0; i < 5; i++) await repo.create(makeUser());
      const result = await repo.listForNotificationTargeting({ limit: 2 });
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });
});
