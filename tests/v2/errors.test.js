const { handleError } = require("../../src/controllers/v2/_shared/errors");

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("v2 handleError", () => {
  test("maps known status to envelope with code", () => {
    const res = mockRes();
    handleError(res, { status: 404, message: "Not found" });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });

  test("uses custom code when provided", () => {
    const res = mockRes();
    handleError(res, { status: 400, code: "INVALID_EMAIL", message: "bad" });
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "INVALID_EMAIL", message: "bad" },
    });
  });

  test("preserves error.data as details (no longer spread at top level)", () => {
    const res = mockRes();
    handleError(res, { status: 400, message: "validation", data: { field: "qty" } });
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "BAD_REQUEST", message: "validation", details: { field: "qty" } },
    });
  });

  test("never returns success: true on errors", () => {
    const res = mockRes();
    handleError(res, { status: 400, data: { results: [] } });
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
  });

  test("defaults to 500 INTERNAL_ERROR when no status", () => {
    const res = mockRes();
    handleError(res, new Error("boom"));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "boom" },
    });
  });

  test("uses fallback message when error.message missing", () => {
    const res = mockRes();
    handleError(res, { status: 500 });
    expect(res.json.mock.calls[0][0].error.message).toBe("Internal server error");
  });

  test("never returns top-level message field on errors", () => {
    const res = mockRes();
    handleError(res, { status: 400, message: "x" });
    const body = res.json.mock.calls[0][0];
    expect(body).not.toHaveProperty("message");
  });
});
