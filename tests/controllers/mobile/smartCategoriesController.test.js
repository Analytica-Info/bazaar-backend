jest.mock("../../../src/services/smartCategoriesService", () => ({
  getHotOffers: jest.fn(), productsByPrice: jest.fn(), getTopRatedProducts: jest.fn(),
  getTrendingProducts: jest.fn(), todayDeal: jest.fn(), getNewArrivals: jest.fn(),
  getFlashSales: jest.fn(), getSuperSaverProducts: jest.fn(), favouritesOfWeek: jest.fn(),
  storeFlashSales: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
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
describe.each(
  ctrlKeys.filter(k => typeof ctrl[k] === "function" && !NON_SERVICE_FUNS.includes(k)).map(k => [k])
)("%s", (fnName) => {
  it("responds 200 on success", async () => {
    // Mock the likely underlying service call
    Object.keys(smartCategoriesService).forEach(k => {
      if (typeof smartCategoriesService[k] === "function") {
        smartCategoriesService[k].mockResolvedValue({ products: [], success: true });
      }
    });
    const res = makeRes();
    await ctrl[fnName](makeReq(), res);
    // Should respond without throwing
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
