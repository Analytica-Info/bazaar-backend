jest.mock("../../../src/services/metricsService");
jest.mock("../../../src/config/redis", () => ({
  getClient: jest.fn(),
  isEnabled: jest.fn(),
}));
jest.mock("mongoose", () => ({
  connection: { readyState: 1 },
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const metrics = require("../../../src/services/metricsService");
const { getClient, isEnabled } = require("../../../src/config/redis");
const ctrl = require("../../../src/controllers/ecommerce/monitoringController");

const makeReq = (opts = {}) => ({ query: opts.query || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => {
  jest.clearAllMocks();
  isEnabled.mockReturnValue(true);
  getClient.mockReturnValue({ status: "ready" });
});

// ── getOverview ───────────────────────────────────────────────────
describe("getOverview", () => {
  it("200 on success", async () => {
    metrics.getLastHourTotals.mockResolvedValue({ requests: 100 });
    metrics.getRecentErrors.mockResolvedValue([]);
    const res = makeRes();
    await ctrl.getOverview(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ health: expect.any(Object) })
    }));
  });
  it("500 on error", async () => {
    metrics.getLastHourTotals.mockRejectedValue(new Error("redis down"));
    metrics.getRecentErrors.mockResolvedValue([]);
    const res = makeRes();
    await ctrl.getOverview(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it("shows redis disconnected when not enabled", async () => {
    isEnabled.mockReturnValue(false);
    metrics.getLastHourTotals.mockResolvedValue({});
    metrics.getRecentErrors.mockResolvedValue([]);
    const res = makeRes();
    await ctrl.getOverview(makeReq(), res);
    const response = res.json.mock.calls[0][0];
    expect(response.data.health.redisState).toBe("disabled");
  });
  it("shows redis connecting when enabled but not ready", async () => {
    isEnabled.mockReturnValue(true);
    getClient.mockReturnValue({ status: "connecting" });
    metrics.getLastHourTotals.mockResolvedValue({});
    metrics.getRecentErrors.mockResolvedValue([]);
    const res = makeRes();
    await ctrl.getOverview(makeReq(), res);
    const response = res.json.mock.calls[0][0];
    expect(response.data.health.redisState).toBe("connecting");
  });
});

// ── getWebhookTimeline ────────────────────────────────────────────
describe("getWebhookTimeline", () => {
  it("200 on success", async () => {
    metrics.getWebhookTimeline.mockResolvedValue({ data: [] });
    metrics.getErrorTimeline.mockResolvedValue([]);
    const req = makeReq({ query: { window: "60" } });
    const res = makeRes();
    await ctrl.getWebhookTimeline(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("clamps window to 1440", async () => {
    metrics.getWebhookTimeline.mockResolvedValue({});
    metrics.getErrorTimeline.mockResolvedValue([]);
    const req = makeReq({ query: { window: "99999" } });
    const res = makeRes();
    await ctrl.getWebhookTimeline(req, res);
    expect(metrics.getWebhookTimeline).toHaveBeenCalledWith(1440);
  });
  it("500 on error", async () => {
    metrics.getWebhookTimeline.mockRejectedValue(new Error("db"));
    metrics.getErrorTimeline.mockResolvedValue([]);
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getWebhookTimeline(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getErrors ─────────────────────────────────────────────────────
describe("getErrors", () => {
  it("200 on success", async () => {
    metrics.getRecentErrors.mockResolvedValue([{ message: "err" }]);
    const req = makeReq({ query: { limit: "20" } });
    const res = makeRes();
    await ctrl.getErrors(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("clamps limit to 200", async () => {
    metrics.getRecentErrors.mockResolvedValue([]);
    const req = makeReq({ query: { limit: "9999" } });
    const res = makeRes();
    await ctrl.getErrors(req, res);
    expect(metrics.getRecentErrors).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    metrics.getRecentErrors.mockRejectedValue(new Error("redis"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getErrors(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getRequestTimeline ────────────────────────────────────────────
describe("getRequestTimeline", () => {
  it("200 on success", async () => {
    metrics.getRequestTimeline.mockResolvedValue({ timeline: [] });
    const req = makeReq({ query: { window: "30" } });
    const res = makeRes();
    await ctrl.getRequestTimeline(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("500 on error", async () => {
    metrics.getRequestTimeline.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getRequestTimeline(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getDiscountSyncTimeline ───────────────────────────────────────
describe("getDiscountSyncTimeline", () => {
  it("200 on success", async () => {
    metrics.getDiscountSyncTimeline.mockResolvedValue({ timeline: [] });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getDiscountSyncTimeline(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("500 on error", async () => {
    metrics.getDiscountSyncTimeline.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getDiscountSyncTimeline(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
