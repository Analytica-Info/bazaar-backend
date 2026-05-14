/**
 * Health endpoint integration tests.
 * Tests /healthz (liveness) and /readyz (readiness) in isolation,
 * without booting the full server.
 */
const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");

// Build a minimal express app that only wires the health routes
// (same implementation as server.js, extracted for testability)
function buildHealthApp(mongooseConn) {
  const app = express();

  app.get("/healthz", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (req, res) => {
    const dbState = mongooseConn.readyState;
    const ready = dbState === 1;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not ready",
      checks: {
        mongodb: { state: dbState, connected: ready },
      },
    });
  });

  return app;
}

describe("/healthz (liveness probe)", () => {
  it("returns 200 with status ok — always", async () => {
    // Use a mock connection object; /healthz ignores DB state
    const app = buildHealthApp({ readyState: 0 });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns 200 even when DB is disconnected", async () => {
    const app = buildHealthApp({ readyState: 0 });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
  });
});

describe("/readyz (readiness probe)", () => {
  it("returns 200 when MongoDB readyState is 1 (connected)", async () => {
    const app = buildHealthApp({ readyState: 1 });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.mongodb.connected).toBe(true);
  });

  it("returns 503 when MongoDB readyState is 0 (disconnected)", async () => {
    const app = buildHealthApp({ readyState: 0 });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not ready");
    expect(res.body.checks.mongodb.connected).toBe(false);
    expect(res.body.checks.mongodb.state).toBe(0);
  });

  it("returns 503 when MongoDB readyState is 2 (connecting)", async () => {
    const app = buildHealthApp({ readyState: 2 });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.checks.mongodb.state).toBe(2);
  });

  it("returns 503 when MongoDB readyState is 3 (disconnecting)", async () => {
    const app = buildHealthApp({ readyState: 3 });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
  });

  it("response body includes mongodb check object", async () => {
    const app = buildHealthApp({ readyState: 1 });
    const res = await request(app).get("/readyz");
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.mongodb).toBeDefined();
    expect(typeof res.body.checks.mongodb.state).toBe("number");
  });
});
