jest.mock("../../../src/services/smartCategoriesService", () => ({
  getHotOffers: jest.fn(), productsByPrice: jest.fn(), getTopRatedProducts: jest.fn(),
  getTrendingProducts: jest.fn(), todayDeal: jest.fn(), getNewArrivals: jest.fn(),
  getFlashSales: jest.fn(), getSuperSaverProducts: jest.fn(), favouritesOfWeek: jest.fn(),
  storeFlashSales: jest.fn(),
}));
const mockFlashSalesModel = { findOne: jest.fn(), find: jest.fn() };
const mockProductsModel = { find: jest.fn() };
jest.mock("../../../src/repositories", () => ({
  flashSales: { rawModel: () => mockFlashSalesModel },
  products: { rawModel: () => mockProductsModel },
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const smartCategoriesService = require("../../../src/services/smartCategoriesService");
const ctrl = require("../../../src/controllers/ecommerce/smartCategoriesController");

const makeReq = (opts = {}) => ({ query: opts.query || {}, body: opts.body || {}, params: opts.params || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn().mockReturnValue(r);
  r.write = jest.fn().mockReturnValue(r);
  r.end = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("hotOffers", () => {
  it("200 on success", async () => {
    smartCategoriesService.getHotOffers.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.hotOffers(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.getHotOffers.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.hotOffers(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("productsByPrice", () => {
  it("200 on success", async () => {
    smartCategoriesService.productsByPrice.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.productsByPrice(makeReq({ query: { start: "10", end: "100" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes responseBody error", async () => {
    smartCategoriesService.productsByPrice.mockRejectedValue({ status: 400, responseBody: { message: "bad range" } });
    const res = makeRes();
    await ctrl.productsByPrice(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    smartCategoriesService.productsByPrice.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.productsByPrice(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getTopRatedProducts", () => {
  it("200 on success", async () => {
    smartCategoriesService.getTopRatedProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.getTopRatedProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.getTopRatedProducts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getTopRatedProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("trendingProducts", () => {
  it("200 on success", async () => {
    smartCategoriesService.getTrendingProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.trendingProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.getTrendingProducts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.trendingProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("todayDeal", () => {
  it("200 on success", async () => {
    smartCategoriesService.todayDeal.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.todayDeal(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.todayDeal.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.todayDeal(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getNewArrivals", () => {
  it("200 on success", async () => {
    smartCategoriesService.getNewArrivals.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.getNewArrivals(makeReq({ query: { page: "1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.getNewArrivals.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getNewArrivals(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getFlashSales", () => {
  it("200 on success", async () => {
    smartCategoriesService.getFlashSales.mockResolvedValue({ flashSales: [] });
    const res = makeRes();
    await ctrl.getFlashSales(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.getFlashSales.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getFlashSales(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getSuperSaverProducts", () => {
  it("200 on success", async () => {
    smartCategoriesService.getSuperSaverProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.getSuperSaverProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.getSuperSaverProducts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getSuperSaverProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("favouritesOfWeek", () => {
  it("200 on success", async () => {
    smartCategoriesService.favouritesOfWeek.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.favouritesOfWeek(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    smartCategoriesService.favouritesOfWeek.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.favouritesOfWeek(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("storeFlashSales", () => {
  it("200 on success", async () => {
    smartCategoriesService.storeFlashSales.mockResolvedValue({ success: true });
    const res = makeRes();
    await ctrl.storeFlashSales(makeReq({ body: {} }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
  it("passes responseBody error", async () => {
    smartCategoriesService.storeFlashSales.mockRejectedValue({ status: 400, responseBody: { message: "invalid" } });
    const res = makeRes();
    await ctrl.storeFlashSales(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    smartCategoriesService.storeFlashSales.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.storeFlashSales(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("toggleFlashSaleStatus", () => {
  it("400 when isEnabled not boolean", async () => {
    const res = makeRes();
    await ctrl.toggleFlashSaleStatus(makeReq({ body: { isEnabled: "yes" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("404 when no flash sale found", async () => {
    mockFlashSalesModel.findOne.mockResolvedValue(null);
    const res = makeRes();
    await ctrl.toggleFlashSaleStatus(makeReq({ body: { isEnabled: true } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("200 on success", async () => {
    const flashSaleDoc = { isEnabled: false, save: jest.fn().mockResolvedValue() };
    mockFlashSalesModel.findOne.mockResolvedValue(flashSaleDoc);
    const res = makeRes();
    await ctrl.toggleFlashSaleStatus(makeReq({ body: { isEnabled: true } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("500 on error", async () => {
    mockFlashSalesModel.findOne.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.toggleFlashSaleStatus(makeReq({ body: { isEnabled: true } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getFlashSaleData", () => {
  it("200 on success", async () => {
    mockFlashSalesModel.findOne.mockResolvedValue({ _id: "fs1" });
    const res = makeRes();
    await ctrl.getFlashSaleData(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("404 when no flash sale", async () => {
    mockFlashSalesModel.findOne.mockResolvedValue(null);
    const res = makeRes();
    await ctrl.getFlashSaleData(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on error", async () => {
    mockFlashSalesModel.findOne.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getFlashSaleData(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
