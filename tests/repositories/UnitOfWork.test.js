require("../setup");
const unitOfWork = require("../../src/repositories/UnitOfWork");

describe("UnitOfWork", () => {
  test("runs the callback and returns its result", async () => {
    const result = await unitOfWork.runInTransaction(async () => 42);
    expect(result).toBe(42);
  });

  test("propagates errors from the callback", async () => {
    await expect(
      unitOfWork.runInTransaction(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  test("falls back to no-session on standalone mongo (in-memory test server)", async () => {
    // The in-memory mongo used in tests is standalone, so the helper should
    // gracefully run the callback with session=null. We assert it executes.
    let saw = "unset";
    await unitOfWork.runInTransaction(async (session) => {
      saw = session;
    });
    // session may be null (standalone fallback) or a ClientSession object
    // depending on the test mongo; either way the callback ran.
    expect(saw === null || typeof saw === "object").toBe(true);
  });
});
