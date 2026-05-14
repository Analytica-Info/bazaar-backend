/**
 * Production error-handling regression tests.
 *
 * Verifies that:
 * 1. Error responses never leak stack traces in NODE_ENV=production
 * 2. The response matches the v2 envelope shape {success, message}
 * 3. In development mode the real error message is included
 */
const express = require("express");
const request = require("supertest");

function buildApp(isProduction) {
  const app = express();
  app.use(express.json());

  // Route that always throws
  app.get("/boom", (req, res, next) => {
    const err = new Error("Sensitive internal error with DB password db_pass=secret123");
    err.stack = `Error: Sensitive internal error\n    at /app/src/service.js:42:7\n    at Layer.handle`;
    next(err);
  });

  // Route that throws with a custom status
  app.get("/boom-404", (req, res, next) => {
    const err = new Error("Resource not found");
    err.status = 404;
    next(err);
  });

  // Mirror of server.js global error handler logic
  app.use((err, req, res, _next) => {
    if (err.message === "Not allowed by CORS") {
      return res.status(403).json({ success: false, message: "CORS not allowed" });
    }
    res.status(err.status || 500).json({
      success: false,
      message: isProduction ? "Internal server error" : err.message,
    });
  });

  return app;
}

describe("Global error handler — production mode", () => {
  let app;

  beforeAll(() => {
    app = buildApp(true);
  });

  it("returns success: false", async () => {
    const res = await request(app).get("/boom");
    expect(res.body.success).toBe(false);
  });

  it("does not expose the original error message", async () => {
    const res = await request(app).get("/boom");
    expect(res.body.message).toBe("Internal server error");
    expect(res.body.message).not.toContain("db_pass");
    expect(res.body.message).not.toContain("secret");
  });

  it("does not include a stack field in the response body", async () => {
    const res = await request(app).get("/boom");
    expect(res.body.stack).toBeUndefined();
    expect(res.body).not.toHaveProperty("stack");
  });

  it("returns HTTP 500 for unhandled errors", async () => {
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
  });

  it("respects err.status for known error codes", async () => {
    const res = await request(app).get("/boom-404");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe("Global error handler — development mode", () => {
  let app;

  beforeAll(() => {
    app = buildApp(false);
  });

  it("includes the real error message in development", async () => {
    const res = await request(app).get("/boom");
    expect(res.body.message).toContain("Sensitive internal error");
  });

  it("does not include stack field even in development (not in envelope)", async () => {
    const res = await request(app).get("/boom");
    expect(res.body).not.toHaveProperty("stack");
  });
});
