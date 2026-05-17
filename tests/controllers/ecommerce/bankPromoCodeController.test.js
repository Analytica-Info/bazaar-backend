jest.mock("../../../src/services/bankPromoCodeService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const bankPromoCodeService = require("../../../src/services/bankPromoCodeService");
const ctrl = require("../../../src/controllers/ecommerce/bankPromoCodeController");

const makeReq = (opts = {}) => ({ params: opts.params || {}, body: opts.body || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("list", () => {
  it("200 on success", async () => {
    bankPromoCodeService.list.mockResolvedValue([{ code: "BANK10" }]);
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, promos: expect.any(Array) }));
  });
  it("passes status error", async () => {
    bankPromoCodeService.list.mockRejectedValue({ status: 404, message: "none" });
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    bankPromoCodeService.list.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("create", () => {
  it("201 on success", async () => {
    bankPromoCodeService.create.mockResolvedValue({ _id: "p1" });
    const res = makeRes();
    await ctrl.create(makeReq({ body: { code: "BANK10" } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("passes status error", async () => {
    bankPromoCodeService.create.mockRejectedValue({ status: 409, message: "exists" });
    const res = makeRes();
    await ctrl.create(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    bankPromoCodeService.create.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.create(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getById", () => {
  it("200 on success", async () => {
    bankPromoCodeService.getById.mockResolvedValue({ _id: "p1" });
    const res = makeRes();
    await ctrl.getById(makeReq({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    bankPromoCodeService.getById.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.getById(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("update", () => {
  it("200 on success", async () => {
    bankPromoCodeService.update.mockResolvedValue({ _id: "p1" });
    const res = makeRes();
    await ctrl.update(makeReq({ params: { id: "p1" }, body: { code: "BANK20" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    bankPromoCodeService.update.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.update(makeReq({ params: { id: "bad" }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("toggleActive", () => {
  it("200 on success", async () => {
    bankPromoCodeService.toggleActive.mockResolvedValue({ message: "activated", promo: { _id: "p1", isActive: true } });
    const res = makeRes();
    await ctrl.toggleActive(makeReq({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "activated" }));
  });
  it("passes status error", async () => {
    bankPromoCodeService.toggleActive.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.toggleActive(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    bankPromoCodeService.toggleActive.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.toggleActive(makeReq({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("delete", () => {
  it("200 on success", async () => {
    bankPromoCodeService.remove.mockResolvedValue();
    const res = makeRes();
    await ctrl.delete(makeReq({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Promo code deleted successfully." }));
  });
  it("passes status error", async () => {
    bankPromoCodeService.remove.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.delete(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    bankPromoCodeService.remove.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.delete(makeReq({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
