jest.mock("../../../src/services/orderService", () => ({
  storeAddress: jest.fn(), deleteAddress: jest.fn(), setPrimaryAddress: jest.fn(), getAddresses: jest.fn(),
  createStripeCheckoutSession: jest.fn(), createTabbyCheckoutSession: jest.fn(),
  createNomodCheckoutSession: jest.fn(), verifyTabbyPayment: jest.fn(), verifyNomodPayment: jest.fn(),
  getOrders: jest.fn(), initStripePayment: jest.fn(), validateInventoryBeforeCheckout: jest.fn(),
  handleTabbyWebhook: jest.fn(), updateOrderStatus: jest.fn(), getPaymentIntent: jest.fn(),
  getPaymentMethods: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../../src/utilities/activityLogger", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/utilities/backendLogger", () => ({ logBackendActivity: jest.fn().mockResolvedValue(undefined) }));

const orderService = require("../../../src/services/orderService");
const ctrl = require("../../../src/controllers/mobile/orderController");

const makeReq = (opts = {}) => ({
  user: opts.user || { _id: "u1", fcmToken: null },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  headers: opts.headers || {},
  file: opts.file || null,
  socket: { remoteAddress: "127.0.0.1" },
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── checkoutSession ───────────────────────────────────────────────
describe("checkoutSession", () => {
  it("200 on success", async () => {
    orderService.createStripeCheckoutSession.mockResolvedValue({ message: "ok", orderId: "o1" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1" }));
  });
  it("passes status error", async () => {
    orderService.createStripeCheckoutSession.mockRejectedValue({ status: 400, message: "cart empty" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    orderService.createStripeCheckoutSession.mockRejectedValue(new Error("stripe down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── checkoutSessionTabby ──────────────────────────────────────────
describe("checkoutSessionTabby", () => {
  it("200 on success", async () => {
    orderService.createTabbyCheckoutSession.mockResolvedValue({ message: "ok", paymentId: "pay_1", status: "created" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSessionTabby(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    orderService.createTabbyCheckoutSession.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSessionTabby(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    orderService.createTabbyCheckoutSession.mockRejectedValue(new Error("tabby down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSessionTabby(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── verifyTabbyPayment ────────────────────────────────────────────
describe("verifyTabbyPayment", () => {
  it("200 with finalStatus", async () => {
    orderService.verifyTabbyPayment.mockResolvedValue({ message: "ok", finalStatus: "AUTHORIZED" });
    const req = makeReq({ query: { paymentId: "pay_1" } });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ finalStatus: "AUTHORIZED" }));
  });
  it("200 without finalStatus", async () => {
    orderService.verifyTabbyPayment.mockResolvedValue({ message: "pending" });
    const req = makeReq({ query: { paymentId: "pay_1" } });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "pending" }));
  });
  it("passes status error", async () => {
    orderService.verifyTabbyPayment.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    orderService.verifyTabbyPayment.mockRejectedValue(new Error("tabby down"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── checkoutSessionNomod ──────────────────────────────────────────
describe("checkoutSessionNomod", () => {
  it("200 on success", async () => {
    orderService.createNomodCheckoutSession.mockResolvedValue({ message: "ok", paymentId: "pay_n1", status: "created" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSessionNomod(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    orderService.createNomodCheckoutSession.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSessionNomod(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    orderService.createNomodCheckoutSession.mockRejectedValue(new Error("nomod down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkoutSessionNomod(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── verifyNomodPayment ────────────────────────────────────────────
describe("verifyNomodPayment", () => {
  it("200 with finalStatus", async () => {
    orderService.verifyNomodPayment.mockResolvedValue({ message: "ok", finalStatus: "paid" });
    const req = makeReq({ query: { paymentId: "pay_n1" } });
    const res = makeRes();
    await ctrl.verifyNomodPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ finalStatus: "paid" }));
  });
  it("passes status error", async () => {
    orderService.verifyNomodPayment.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.verifyNomodPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── getOrders ─────────────────────────────────────────────────────
describe("getOrders", () => {
  it("200 on success with pagination defaults", async () => {
    orderService.getOrders.mockResolvedValue({ orders: [], total: 0, page: 1, limit: 20 });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getOrders(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(orderService.getOrders).toHaveBeenCalledWith("u1", { page: 1, limit: 20 });
  });
  it("uses query params page and limit", async () => {
    orderService.getOrders.mockResolvedValue({ orders: [], total: 0, page: 2, limit: 5 });
    const req = makeReq({ query: { page: "2", limit: "5" } });
    const res = makeRes();
    await ctrl.getOrders(req, res);
    expect(orderService.getOrders).toHaveBeenCalledWith("u1", { page: 2, limit: 5 });
  });
  it("clamps limit to 100", async () => {
    orderService.getOrders.mockResolvedValue({ orders: [], total: 0, page: 1, limit: 100 });
    const req = makeReq({ query: { limit: "9999" } });
    const res = makeRes();
    await ctrl.getOrders(req, res);
    expect(orderService.getOrders).toHaveBeenCalledWith("u1", { page: 1, limit: 100 });
  });
  it("500 on error", async () => {
    orderService.getOrders.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getOrders(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── initStripePayment ─────────────────────────────────────────────
describe("initStripePayment", () => {
  it("400 when amountAED missing", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.initStripePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("400 when amountAED is 0", async () => {
    const req = makeReq({ body: { amountAED: 0 } });
    const res = makeRes();
    await ctrl.initStripePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("200 on success", async () => {
    orderService.initStripePayment.mockResolvedValue({ clientSecret: "cs_1" });
    const req = makeReq({ body: { amountAED: 100 } });
    const res = makeRes();
    await ctrl.initStripePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    orderService.initStripePayment.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: { amountAED: 50 } });
    const res = makeRes();
    await ctrl.initStripePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── getPaymentMethods ─────────────────────────────────────────────
describe("getPaymentMethods", () => {
  it("200 on success", async () => {
    orderService.getPaymentMethods.mockResolvedValue(["stripe", "tabby"]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getPaymentMethods(req, res);
    expect(res.json).toHaveBeenCalledWith({ methods: ["stripe", "tabby"] });
  });
  it("500 on error", async () => {
    orderService.getPaymentMethods.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getPaymentMethods(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── paymentIntent ─────────────────────────────────────────────────
describe("paymentIntent", () => {
  it("200 on success", async () => {
    orderService.getPaymentIntent.mockResolvedValue({ clientSecret: "pi_1_secret" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.paymentIntent(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    orderService.getPaymentIntent.mockRejectedValue(new Error("stripe"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.paymentIntent(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updateOrderStatus ─────────────────────────────────────────────
describe("updateOrderStatus", () => {
  it("200 on success", async () => {
    orderService.updateOrderStatus.mockResolvedValue({ _id: "o1", status: "delivered" });
    const req = makeReq({ params: { orderId: "o1" }, body: { status: "delivered" } });
    const res = makeRes();
    await ctrl.updateOrderStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    orderService.updateOrderStatus.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { orderId: "bad" }, body: {} });
    const res = makeRes();
    await ctrl.updateOrderStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    orderService.updateOrderStatus.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { orderId: "o1" }, body: {} });
    const res = makeRes();
    await ctrl.updateOrderStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── storeAddress, deleteAddress, setPrimaryAddress, address ───────
describe("storeAddress", () => {
  it("200 on success", async () => {
    orderService.storeAddress.mockResolvedValue({ message: "ok", addresses: [] });
    const req = makeReq({ body: { street: "main" } });
    const res = makeRes();
    await ctrl.storeAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on unknown error", async () => {
    orderService.storeAddress.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.storeAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("deleteAddress", () => {
  it("200 on success", async () => {
    orderService.deleteAddress.mockResolvedValue({ addresses: [] });
    const req = makeReq({ params: { addressId: "a1" } });
    const res = makeRes();
    await ctrl.deleteAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    orderService.deleteAddress.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { addressId: "bad" } });
    const res = makeRes();
    await ctrl.deleteAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("setPrimaryAddress", () => {
  it("200 on success", async () => {
    orderService.setPrimaryAddress.mockResolvedValue({ addresses: [] });
    const req = makeReq({ params: { addressId: "a1" } });
    const res = makeRes();
    await ctrl.setPrimaryAddress(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("address", () => {
  it("200 on success", async () => {
    orderService.getAddresses.mockResolvedValue({ flag: true, address: {} });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.address(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error with flag:false", async () => {
    orderService.getAddresses.mockRejectedValue({ status: 404, message: "none" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.address(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ flag: false }));
  });
});

// ── tabbyWebhook ──────────────────────────────────────────────────
describe("tabbyWebhook", () => {
  it("200 on success with object body", async () => {
    orderService.handleTabbyWebhook.mockResolvedValue({ message: "ok" });
    const req = makeReq({ body: { payment: { id: "p1" } }, headers: { "x-webhook-secret": "secret" } });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("ok");
  });
  it("200 on success with Buffer body", async () => {
    orderService.handleTabbyWebhook.mockResolvedValue({ message: "ok" });
    const req = makeReq({ headers: { "x-webhook-secret": "secret" } });
    req.body = Buffer.from(JSON.stringify({ payment: { id: "p1" } }));
    req.socket = { remoteAddress: "127.0.0.1" };
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("403 on forbidden IP", async () => {
    orderService.handleTabbyWebhook.mockRejectedValue({ status: 403, message: "Forbidden IP" });
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it("401 on unauthorized", async () => {
    orderService.handleTabbyWebhook.mockRejectedValue({ status: 401, message: "Unauthorized" });
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("500 on unknown error", async () => {
    orderService.handleTabbyWebhook.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
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
  });
  it("200 on 400 status error (mobile compat)", async () => {
    orderService.validateInventoryBeforeCheckout.mockRejectedValue({ status: 400, data: { isValid: false, message: "out of stock" } });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.validateInventoryBeforeCheckout(req, res);
    // Mobile returns 200 for 400 errors per published app compat
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ isValid: false, message: "out of stock" });
  });
  it("passes non-400 status errors through", async () => {
    orderService.validateInventoryBeforeCheckout.mockRejectedValue({ status: 403, data: { message: "forbidden" } });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.validateInventoryBeforeCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it("500 on unknown error", async () => {
    orderService.validateInventoryBeforeCheckout.mockRejectedValue(new Error("fail"));
    const req = makeReq({ body: {}, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.validateInventoryBeforeCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
