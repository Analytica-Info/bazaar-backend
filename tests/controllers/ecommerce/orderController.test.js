jest.mock("../../../src/services/orderService");
jest.mock("stripe", () => () => ({
  paymentIntents: { create: jest.fn() },
  checkout: { sessions: { retrieve: jest.fn() } },
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../../src/utilities/activityLogger", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/utilities/backendLogger", () => ({ logBackendActivity: jest.fn().mockResolvedValue(undefined) }));

const orderService = require("../../../src/services/orderService");
const ctrl = require("../../../src/controllers/ecommerce/orderController");

const makeReq = (opts = {}) => ({
  user: { _id: "u1", email: "u@t.com", ...opts.user },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  files: opts.files || [],
  ...opts.extra,
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── storeAddress ──────────────────────────────────────────────────
describe("storeAddress", () => {
  it("200 on success", async () => {
    orderService.storeAddress.mockResolvedValue({ message: "ok", addresses: [] });
    const req = makeReq({ body: { street: "main" } });
    const res = makeRes();
    await ctrl.storeAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error through", async () => {
    orderService.storeAddress.mockRejectedValue({ status: 404, message: "Not found" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.storeAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    orderService.storeAddress.mockRejectedValue(new Error("boom"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.storeAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── deleteAddress ─────────────────────────────────────────────────
describe("deleteAddress", () => {
  it("200 on success", async () => {
    orderService.deleteAddress.mockResolvedValue({ addresses: [] });
    const req = makeReq({ params: { addressId: "a1" } });
    const res = makeRes();
    await ctrl.deleteAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    orderService.deleteAddress.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ params: { addressId: "a1" } });
    const res = makeRes();
    await ctrl.deleteAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    orderService.deleteAddress.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { addressId: "a1" } });
    const res = makeRes();
    await ctrl.deleteAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── setPrimaryAddress ─────────────────────────────────────────────
describe("setPrimaryAddress", () => {
  it("200 on success", async () => {
    orderService.setPrimaryAddress.mockResolvedValue({ addresses: [] });
    const req = makeReq({ params: { addressId: "a1" } });
    const res = makeRes();
    await ctrl.setPrimaryAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    orderService.setPrimaryAddress.mockRejectedValue({ status: 404, message: "gone" });
    const req = makeReq({ params: { addressId: "a1" } });
    const res = makeRes();
    await ctrl.setPrimaryAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── address (get) ────────────────────────────────────────────────
describe("address", () => {
  it("200 with address data", async () => {
    orderService.getAddresses.mockResolvedValue({ flag: true, address: {} });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.address(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, flag: true }));
  });
  it("passes status error with flag:false", async () => {
    orderService.getAddresses.mockRejectedValue({ status: 404, message: "Not found" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.address(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ flag: false }));
  });
  it("500 on unknown error", async () => {
    orderService.getAddresses.mockRejectedValue(new Error("boom"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.address(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── validateInventoryBeforeCheckout ──────────────────────────────
describe("validateInventoryBeforeCheckout", () => {
  it("200 on success", async () => {
    orderService.validateInventoryBeforeCheckout.mockResolvedValue({ isValid: true, message: "ok", results: [] });
    const req = makeReq({ body: { products: [] } });
    const res = makeRes();
    await ctrl.validateInventoryBeforeCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isValid: true }));
  });
  it("returns status+data on structured error", async () => {
    orderService.validateInventoryBeforeCheckout.mockRejectedValue({ status: 400, data: { isValid: false } });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.validateInventoryBeforeCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ isValid: false });
  });
  it("500 on unknown error", async () => {
    orderService.validateInventoryBeforeCheckout.mockRejectedValue(new Error("fail"));
    const req = makeReq({ body: {}, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.validateInventoryBeforeCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── uploadProofOfDelivery ──────────────────────────────────────
describe("uploadProofOfDelivery", () => {
  it("200 on success", async () => {
    orderService.uploadProofOfDelivery.mockResolvedValue({ message: "saved", order_id: "o1", proof_of_delivery: [] });
    const req = makeReq({ body: { order_id: "o1", proof_of_delivery: [] } });
    const res = makeRes();
    await ctrl.uploadProofOfDelivery(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    orderService.uploadProofOfDelivery.mockRejectedValue({ status: 404, message: "Order not found" });
    const req = makeReq({ body: { order_id: "bad" } });
    const res = makeRes();
    await ctrl.uploadProofOfDelivery(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    orderService.uploadProofOfDelivery.mockRejectedValue(new Error("disk full"));
    const req = makeReq({ body: { order_id: "o1" } });
    const res = makeRes();
    await ctrl.uploadProofOfDelivery(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
