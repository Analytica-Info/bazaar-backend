jest.mock("../../../src/services/productService", () => ({
  getCategories: jest.fn(), getSearchCategories: jest.fn(), getProducts: jest.fn(),
  getProductDetails: jest.fn(), searchProducts: jest.fn(), getCategoriesProduct: jest.fn(),
  getSubCategoriesProduct: jest.fn(), getSubSubCategoriesProduct: jest.fn(),
  getSimilarProducts: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../../src/repositories", () => ({
  categories: { rawModel: () => ({ find: jest.fn() }) },
  products: { rawModel: () => ({ findById: jest.fn() }) },
  reviews: { rawModel: () => ({ find: jest.fn() }) },
  productViews: { rawModel: () => ({ findOne: jest.fn() }) },
}));

const productService = require("../../../src/services/productService");
const ctrl = require("../../../src/controllers/mobile/productController");

const makeReq = (opts = {}) => ({
  user: opts.user || null,
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("getCategories", () => {
  it("200 on success", async () => {
    productService.getCategories.mockResolvedValue({ categories: [] });
    const res = makeRes();
    await ctrl.getCategories(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    productService.getCategories.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.getCategories(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getSearchCategories", () => {
  it("200 on success", async () => {
    productService.getSearchCategories.mockResolvedValue({ categories: [] });
    const res = makeRes();
    await ctrl.getSearchCategories(makeReq({ body: { q: "test" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("products", () => {
  it("200 on success", async () => {
    productService.getProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.products(makeReq({ query: { page: "1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    productService.getProducts.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.products(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("productsDetails", () => {
  it("200 on success without user", async () => {
    productService.getProductDetails.mockResolvedValue({ product: { _id: "p1" } });
    const res = makeRes();
    await ctrl.productsDetails(makeReq({ params: { id: "p1" } }), res);
    expect(productService.getProductDetails).toHaveBeenCalledWith("p1", null);
    expect(res.json).toHaveBeenCalledWith({ product: { _id: "p1" } });
  });
  it("200 on success with user", async () => {
    productService.getProductDetails.mockResolvedValue({ product: { _id: "p1" } });
    const res = makeRes();
    await ctrl.productsDetails(makeReq({ params: { id: "p1" }, user: { _id: "u1" } }), res);
    expect(productService.getProductDetails).toHaveBeenCalledWith("p1", "u1");
  });
  it("passes status error", async () => {
    productService.getProductDetails.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.productsDetails(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("searchProduct", () => {
  it("200 on success", async () => {
    productService.searchProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.searchProduct(makeReq({ body: { q: "test" } }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("passes structured error with data", async () => {
    productService.searchProducts.mockRejectedValue({ status: 400, message: "bad", data: { suggestion: "did you mean X" } });
    const res = makeRes();
    await ctrl.searchProduct(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ suggestion: "did you mean X" }));
  });
  it("500 on unknown error", async () => {
    productService.searchProducts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.searchProduct(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("search", () => {
  it("200 on success", async () => {
    productService.searchProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.search(makeReq({ body: { q: "test" } }), res);
    expect(res.json).toHaveBeenCalled();
  });
});

describe("categoriesProduct", () => {
  it("200 on success", async () => {
    productService.getCategoriesProduct.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.categoriesProduct(makeReq({ params: { id: "cat1" }, query: {} }), res);
    expect(res.json).toHaveBeenCalled();
  });
});
