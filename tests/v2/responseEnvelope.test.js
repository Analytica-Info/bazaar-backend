const { wrap, paginated, wrapError } = require("../../src/controllers/v2/_shared/responseEnvelope");

describe("v2 responseEnvelope", () => {
  describe("wrap", () => {
    test("wraps data with success: true", () => {
      expect(wrap({ id: 1 })).toEqual({ success: true, data: { id: 1 } });
    });

    test("includes message when provided", () => {
      expect(wrap(null, "ok")).toEqual({ success: true, message: "ok", data: null });
    });

    test("omits message when undefined", () => {
      const result = wrap({ a: 1 });
      expect(result).not.toHaveProperty("message");
    });
  });

  describe("paginated", () => {
    test("returns success, data array, and meta block", () => {
      const result = paginated([{ id: 1 }, { id: 2 }], 50, 2, 10);
      expect(result).toEqual({
        success: true,
        data: [{ id: 1 }, { id: 2 }],
        meta: { total: 50, page: 2, limit: 10, pages: 5 },
      });
    });

    test("computes pages correctly with rounding up", () => {
      expect(paginated([], 11, 1, 10).meta.pages).toBe(2);
    });

    test("merges extraMeta into meta", () => {
      const result = paginated([], 0, 1, 20, { unreadCount: 7 });
      expect(result.meta).toMatchObject({ total: 0, page: 1, limit: 20, unreadCount: 7 });
    });

    test("extraMeta does not leak to top level", () => {
      const result = paginated([], 0, 1, 20, { unreadCount: 7 });
      expect(result).not.toHaveProperty("unreadCount");
    });
  });

  describe("wrapError", () => {
    test("standard error shape", () => {
      expect(wrapError("NOT_FOUND", "thing missing")).toEqual({
        success: false,
        error: { code: "NOT_FOUND", message: "thing missing" },
      });
    });

    test("includes details when provided", () => {
      const result = wrapError("BAD_REQUEST", "invalid", { field: "email" });
      expect(result.error).toEqual({ code: "BAD_REQUEST", message: "invalid", details: { field: "email" } });
    });

    test("omits details when undefined", () => {
      const result = wrapError("X", "y");
      expect(result.error).not.toHaveProperty("details");
    });
  });
});
