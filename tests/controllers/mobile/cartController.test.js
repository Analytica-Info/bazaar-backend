jest.mock("../../../src/services/cartService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const cartService = require("../../../src/services/cartService");
const ctrl = require("../../../src/controllers/mobile/cartController");

const makeReq = (opts = {}) => ({
  user: { _id: "u1", ...opts.user },
  body: opts.body || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("getCart", () => {
  it("200 on success", async () => {
    cartService.getCart.mockResolvedValue({ cart: [] });
    const res = makeRes();
    await ctrl.getCart(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(cartService.getCart).toHaveBeenCalledWith("u1", { includeGiftLogic: true });
  });
  it("500 on error", async () => {
    cartService.getCart.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getCart(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("addToCart", () => {
  it("200 on success", async () => {
    cartService.addToCart.mockResolvedValue({ cart: [], cartCount: 1 });
    const req = makeReq({ body: { product_id: "p1", qty: 1 } });
    const res = makeRes();
    await ctrl.addToCart(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(cartService.addToCart).toHaveBeenCalledWith("u1", expect.any(Object), { validateVariantQty: false });
  });
  it("passes status error", async () => {
    cartService.addToCart.mockRejectedValue({ status: 400, message: "bad", cartCount: 0, cart: [] });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.addToCart(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    cartService.addToCart.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.addToCart(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("removeFromCart", () => {
  it("200 on success", async () => {
    cartService.removeFromCart.mockResolvedValue({ cart: [] });
    const req = makeReq({ body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.removeFromCart(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    cartService.removeFromCart.mockRejectedValue({ status: 404, message: "not in cart" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.removeFromCart(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    cartService.removeFromCart.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.removeFromCart(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("increaseCartQty", () => {
  it("200 on success", async () => {
    cartService.increaseQty.mockResolvedValue({ cart: [], cartCount: 2 });
    const req = makeReq({ body: { product_id: "p1", qty: 1 } });
    const res = makeRes();
    await ctrl.increaseCartQty(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(cartService.increaseQty).toHaveBeenCalledWith("u1", "p1", 1, { validateAvailableQty: false });
  });
  it("passes status error", async () => {
    cartService.increaseQty.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.increaseCartQty(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("decreaseCartQty", () => {
  it("200 on success", async () => {
    cartService.decreaseQty.mockResolvedValue({ message: "qty decreased", cart: [] });
    const req = makeReq({ body: { product_id: "p1", qty: 1 } });
    const res = makeRes();
    await ctrl.decreaseCartQty(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    cartService.decreaseQty.mockRejectedValue({ status: 400, message: "bad qty" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.decreaseCartQty(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
