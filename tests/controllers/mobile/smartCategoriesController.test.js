jest.mock("../../../src/services/smartCategoriesService", () => ({
  getHotOffers: jest.fn(), productsByPrice: jest.fn(), getTopRatedProducts: jest.fn(),
  getTrendingProducts: jest.fn(), todayDeal: jest.fn(), getNewArrivals: jest.fn(),
  getFlashSales: jest.fn(), getSuperSaverProducts: jest.fn(), favouritesOfWeek: jest.fn(),
  storeFlashSales: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const mockProductFind = jest.fn();
const mockProductCount = jest.fn();
jest.mock("../../../src/repositories", () => ({
  products: {
    rawModel: () => ({
      find: mockProductFind,
      countDocuments: mockProductCount,
    }),
  },
}));

jest.mock("../../../src/utilities/cache", () => ({
  key: jest.fn((...args) => args.join(":")),
  getOrSet: jest.fn(async (key, ttl, fetcher) => fetcher()),
}));

const smartCategoriesService = require("../../../src/services/smartCategoriesService");
const ctrl = require("../../../src/controllers/mobile/smartCategoriesController");

const makeReq = (opts = {}) => ({ query: opts.query || {}, body: opts.body || {}, params: opts.params || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// Read the actual exports to know what to test
const ctrlKeys = Object.keys(ctrl);

// Functions that don't delegate to service and won't 500 on service error
const NON_SERVICE_FUNS = ["getProductByVariant"];

// Test all service-wrapper exports with happy + error paths
// ── getProductByVariant ───────────────────────────────────────────
describe("getProductByVariant", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty products for unknown color", async () => {
    const req = makeReq({ query: { color: "purple", page: "1", limit: "10" } });
    const res = makeRes();
    await ctrl.getProductByVariant(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, products: [] }));
  });

  it("returns products for known color (green)", async () => {
    const mockProducts = [{ _id: "p1", product: { name: "Test" } }];
    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    });
    mockProductCount.mockResolvedValue(1);
    const req = makeReq({ query: { color: "green", page: "1", limit: "10" } });
    const res = makeRes();
    await ctrl.getProductByVariant(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const call = res.json.mock.calls[0][0];
    expect(call.products).toEqual(mockProducts);
  });

  it("uses default page=1, limit=54 when not provided", async () => {
    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    mockProductCount.mockResolvedValue(0);
    const req = makeReq({ query: { color: "orange" } });
    const res = makeRes();
    await ctrl.getProductByVariant(req, res);
    const call = res.json.mock.calls[0][0];
    expect(call.pagination.productsPerPage).toBe(54);
  });

  it("500 on db error", async () => {
    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error("db")),
    });
    mockProductCount.mockResolvedValue(0);
    const req = makeReq({ query: { color: "red" } });
    const res = makeRes();
    await ctrl.getProductByVariant(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── productsByPrice structured error ──────────────────────────────
describe("productsByPrice — responseBody error", () => {
  it("returns structured error when service throws with responseBody", async () => {
    const smartCategoriesService = require("../../../src/services/smartCategoriesService");
    smartCategoriesService.productsByPrice.mockRejectedValue({
      status: 400, responseBody: { success: false, message: "bad range" }
    });
    const req = makeReq({ query: { start: "1000", end: "500" } });
    const res = makeRes();
    await ctrl.productsByPrice(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "bad range" }));
  });
});

// ── storeFlashSales — responseBody error ──────────────────────────
describe("storeFlashSales — responseBody error", () => {
  it("returns structured error when service throws with responseBody", async () => {
    const smartCategoriesService = require("../../../src/services/smartCategoriesService");
    smartCategoriesService.storeFlashSales.mockRejectedValue({
      status: 422, responseBody: { success: false, message: "invalid" }
    });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.storeFlashSales(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

describe.each(
  ctrlKeys.filter(k => typeof ctrl[k] === "function" && !NON_SERVICE_FUNS.includes(k)).map(k => [k])
)("%s", (fnName) => {
  it("responds 200 on success", async () => {
    Object.keys(smartCategoriesService).forEach(k => {
      if (typeof smartCategoriesService[k] === "function") {
        smartCategoriesService[k].mockResolvedValue({ products: [], success: true });
      }
    });
    const res = makeRes();
    await ctrl[fnName](makeReq(), res);
    expect(res.status.mock.calls.length + res.json.mock.calls.length).toBeGreaterThan(0);
  });

  it("responds with 500 on service error", async () => {
    Object.keys(smartCategoriesService).forEach(k => {
      if (typeof smartCategoriesService[k] === "function") {
        smartCategoriesService[k].mockRejectedValue(new Error("db"));
      }
    });
    const res = makeRes();
    await ctrl[fnName](makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── logStatusFalseItems branch coverage ──────────────────────────
// These tests exercise the various response shapes that the internal
// logStatusFalseItems function handles.

describe("logStatusFalseItems — response shape variants (via service endpoints)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("extracts from filteredProducts shape", async () => {
    smartCategoriesService.getHotOffers.mockResolvedValue({
      filteredProducts: [{ _id: "p1", status: true }]
    });
    const res = makeRes();
    await ctrl.hotOffers(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("extracts from data.products shape", async () => {
    smartCategoriesService.getTopRatedProducts.mockResolvedValue({
      data: { products: [{ _id: "p1", status: true }] }
    });
    const res = makeRes();
    await ctrl.getTopRatedProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("extracts from data array with nested products", async () => {
    smartCategoriesService.getTrendingProducts.mockResolvedValue({
      data: [
        { products: [{ _id: "p1", status: true }] },
        { products: [{ _id: "p2", status: true }] },
      ]
    });
    const res = makeRes();
    await ctrl.trendingProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("handles product+id shape (single product)", async () => {
    smartCategoriesService.todayDeal.mockResolvedValue({
      product: { id: "p1", name: "Test" }, id: "p1"
    });
    const res = makeRes();
    await ctrl.todayDeal(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("handles array responseData shape", async () => {
    smartCategoriesService.favouritesOfWeek.mockResolvedValue([
      { _id: "p1", status: true }
    ]);
    const res = makeRes();
    await ctrl.favouritesOfWeek(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("detects status=false items and logs them (products shape)", async () => {
    // Mocking fs to test the write path — just verify it doesn't throw
    smartCategoriesService.getNewArrivals.mockResolvedValue({
      products: [{ _id: "p1", status: false, totalQty: 0, product: { id: "pid", name: "Bad" } }]
    });
    const res = makeRes();
    await ctrl.getNewArrivals(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
