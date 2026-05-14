jest.mock("../../../src/services/productSyncService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const productSyncService = require("../../../src/services/productSyncService");
const ctrl = require("../../../src/controllers/ecommerce/productDiscountFixController");

const makeReq = (opts = {}) => ({ query: opts.query || {}, body: opts.body || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("getProductsWithProductUpdateWebhook", () => {
  it("200 on success", async () => {
    productSyncService.getProductsWithWebhookUpdate.mockResolvedValue({ count: 1, webhook: {}, products: [] });
    const res = makeRes();
    await ctrl.getProductsWithProductUpdateWebhook(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("500 on error", async () => {
    productSyncService.getProductsWithWebhookUpdate.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getProductsWithProductUpdateWebhook(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("syncProductUpdateWebhookDiscounts", () => {
  it("200 on success", async () => {
    productSyncService.syncWebhookDiscounts.mockResolvedValue({
      distinctParentIds: 5, syncedParentIds: 5, skippedNotEligible: 0, bulkWriteOperations: 5
    });
    const res = makeRes();
    await ctrl.syncProductUpdateWebhookDiscounts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("500 on error", async () => {
    productSyncService.syncWebhookDiscounts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.syncProductUpdateWebhookDiscounts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
