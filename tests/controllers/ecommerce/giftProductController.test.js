jest.mock("../../../src/services/giftProductService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const giftProductService = require("../../../src/services/giftProductService");
const ctrl = require("../../../src/controllers/ecommerce/giftProductController");

const makeReq = (opts = {}) => ({ params: opts.params || {}, body: opts.body || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("setGiftProduct", () => {
  it("200 on success", async () => {
    giftProductService.setGiftProduct.mockResolvedValue({ _id: "p1" });
    const req = makeReq({ body: { productId: "p1", variantId: "v1", giftThreshold: 100 } });
    const res = makeRes();
    await ctrl.setGiftProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    giftProductService.setGiftProduct.mockRejectedValue({ status: 404, message: "product not found" });
    const req = makeReq({ body: { productId: "bad" } });
    const res = makeRes();
    await ctrl.setGiftProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    giftProductService.setGiftProduct.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.setGiftProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getGiftProduct", () => {
  it("200 with gift product", async () => {
    giftProductService.getGiftProduct.mockResolvedValue({ _id: "p1", productId: "prod1" });
    const req = makeReq();
    const res = makeRes();
    await ctrl.getGiftProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, giftProduct: expect.any(Object) }));
  });
  it("200 with null when no gift product set", async () => {
    giftProductService.getGiftProduct.mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await ctrl.getGiftProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ giftProduct: null }));
  });
  it("500 on error", async () => {
    giftProductService.getGiftProduct.mockRejectedValue(new Error("db"));
    const req = makeReq();
    const res = makeRes();
    await ctrl.getGiftProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
