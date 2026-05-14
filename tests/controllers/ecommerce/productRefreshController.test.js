jest.mock("../../../src/services/productSyncService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const productSyncService = require("../../../src/services/productSyncService");
const ctrl = require("../../../src/controllers/ecommerce/productRefreshController");

const makeReq = (opts = {}) => ({
  headers: opts.headers || {},
  query: opts.query || {},
  body: opts.body || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("refreshSingleProductById", () => {
  it("200 created on success", async () => {
    productSyncService.refreshSingleProductById.mockResolvedValue({
      created: true, updated: false, productId: "p1", product: { _id: "p1" }
    });
    const req = makeReq({ headers: { "x-lightspeed-product-id": "p1" } });
    const res = makeRes();
    await ctrl.refreshSingleProductById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, created: true }));
  });
  it("200 updated on success", async () => {
    productSyncService.refreshSingleProductById.mockResolvedValue({
      created: false, updated: true, productId: "p1", product: { _id: "p1" }
    });
    const req = makeReq({ query: { productId: "p1" } });
    const res = makeRes();
    await ctrl.refreshSingleProductById(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Product updated in MongoDB." }));
  });
  it("reads productId from x-product-id header", async () => {
    productSyncService.refreshSingleProductById.mockResolvedValue({ created: false, updated: true, productId: "p2", product: {} });
    const req = makeReq({ headers: { "x-product-id": "p2" } });
    const res = makeRes();
    await ctrl.refreshSingleProductById(req, res);
    expect(productSyncService.refreshSingleProductById).toHaveBeenCalledWith("p2");
  });
  it("reads productId from body", async () => {
    productSyncService.refreshSingleProductById.mockResolvedValue({ created: false, updated: true, productId: "p3", product: {} });
    const req = makeReq({ body: { productId: "p3" } });
    const res = makeRes();
    await ctrl.refreshSingleProductById(req, res);
    expect(productSyncService.refreshSingleProductById).toHaveBeenCalledWith("p3");
  });
  it("passes status error", async () => {
    productSyncService.refreshSingleProductById.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ query: { productId: "bad" } });
    const res = makeRes();
    await ctrl.refreshSingleProductById(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    productSyncService.refreshSingleProductById.mockRejectedValue(new Error("network"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.refreshSingleProductById(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
