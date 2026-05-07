jest.mock("../../../src/services/productService", () => ({
  getCategories: jest.fn(), getSearchCategories: jest.fn(), getProducts: jest.fn(),
  getProductDetails: jest.fn(), searchProducts: jest.fn(), getCategoriesProduct: jest.fn(),
  getSubCategoriesProduct: jest.fn(), getSubSubCategoriesProduct: jest.fn(),
  getSimilarProducts: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
const mockCategory = {
  find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(),
};
const mockProduct = {
  findById: jest.fn(), findOne: jest.fn(),
};
const mockReview = {
  find: jest.fn(), findOne: jest.fn(), create: jest.fn(),
};
jest.mock("../../../src/repositories", () => ({
  categories: { rawModel: () => mockCategory },
  products: { rawModel: () => mockProduct },
  reviews: { rawModel: () => mockReview },
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
  it("500 on error", async () => {
    productService.getCategoriesProduct.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.categoriesProduct(makeReq({ params: { id: "x" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("subCategoriesProduct", () => {
  it("200 on success", async () => {
    productService.getSubCategoriesProduct.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.subCategoriesProduct(makeReq({ params: { id: "sub1" }, query: {} }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    productService.getSubCategoriesProduct.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.subCategoriesProduct(makeReq({ params: { id: "sub1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("subSubCategoriesProduct", () => {
  it("200 on success", async () => {
    productService.getSubSubCategoriesProduct.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.subSubCategoriesProduct(makeReq({ params: { id: "ssub1" }, query: {} }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    productService.getSubSubCategoriesProduct.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.subSubCategoriesProduct(makeReq({ params: { id: "ssub1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("similarProducts", () => {
  it("200 on success", async () => {
    productService.getSimilarProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.similarProducts(makeReq({ query: { product_type_id: "pt1", id: "p1" } }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    productService.getSimilarProducts.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.similarProducts(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("search", () => {
  it("passes structured error with data", async () => {
    productService.searchProducts.mockRejectedValue({ status: 400, message: "bad", data: { hint: "x" } });
    const res = makeRes();
    await ctrl.search(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    productService.searchProducts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.search(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── addReview ──────────────────────────────────────────────────────
describe("addReview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates new review when none exists", async () => {
    mockReview.findOne.mockResolvedValue(null);
    mockReview.create.mockResolvedValue({});
    mockReview.find.mockResolvedValue([
      { _doc: { _id: "r1" }, nickname: "N", summary: "S", texttext: "T" }
    ]);
    const req = makeReq({
      user: { _id: "u1" },
      body: { name: "N", description: "S", title: "T", product_id: "p1",
        quality_rating: 5, value_rating: 5, price_rating: 5 },
    });
    const res = makeRes();
    await ctrl.addReview(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Review created successfully" }));
  });

  it("updates existing review", async () => {
    const mockExisting = {
      nickname: "old", summary: "old", texttext: "old",
      quality_rating: 1, value_rating: 1, price_rating: 1, image: null,
      save: jest.fn().mockResolvedValue({}),
    };
    mockReview.findOne.mockResolvedValue(mockExisting);
    mockReview.find.mockResolvedValue([
      { _doc: { _id: "r1" }, nickname: "N", summary: "S", texttext: "T" }
    ]);
    const req = makeReq({
      user: { _id: "u1" },
      body: { name: "N", description: "S", title: "T", product_id: "p1",
        quality_rating: 5, value_rating: 5, price_rating: 5 },
    });
    const res = makeRes();
    await ctrl.addReview(req, res);
    expect(mockExisting.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Review updated successfully" }));
  });

  it("includes file path when req.file present", async () => {
    mockReview.findOne.mockResolvedValue(null);
    mockReview.create.mockResolvedValue({});
    mockReview.find.mockResolvedValue([]);
    const req = {
      ...makeReq({ user: { _id: "u1" }, body: { product_id: "p1" } }),
      file: { path: "uploads\\img.jpg" },
    };
    const res = makeRes();
    await ctrl.addReview(req, res);
    expect(mockReview.create).toHaveBeenCalledWith(expect.objectContaining({
      image: "uploads/img.jpg",
    }));
  });

  it("500 on db error", async () => {
    mockReview.findOne.mockRejectedValue(new Error("db"));
    const req = makeReq({ user: { _id: "u1" }, body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.addReview(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── review ─────────────────────────────────────────────────────────
describe("review", () => {
  beforeEach(() => jest.clearAllMocks());

  it("404 when product not found", async () => {
    mockProduct.findOne.mockResolvedValue(null);
    const req = makeReq({ params: { id: "bad" } });
    const res = makeRes();
    await ctrl.review(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200 with reviews when product found", async () => {
    mockProduct.findOne.mockResolvedValue({ _id: "p1" });
    mockReview.find.mockResolvedValue([
      { _doc: { _id: "r1" }, nickname: "N", summary: "S", texttext: "T" }
    ]);
    const req = makeReq({ params: { id: "prod1" } });
    const res = makeRes();
    await ctrl.review(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Reviews fetched successfully" }));
  });

  it("500 on db error", async () => {
    mockProduct.findOne.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { id: "p1" } });
    const res = makeRes();
    await ctrl.review(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── UserReview ──────────────────────────────────────────────────────
describe("UserReview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("404 when product not found", async () => {
    mockProduct.findOne.mockResolvedValue(null);
    const req = makeReq({ params: { id: "bad" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.UserReview(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200 with user reviews", async () => {
    mockProduct.findOne.mockResolvedValue({ _id: "p1" });
    mockReview.find.mockResolvedValue([
      { _doc: { _id: "r1" }, nickname: "N", summary: "S", texttext: "T" }
    ]);
    const req = makeReq({ params: { id: "prod1" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.UserReview(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Reviews fetched successfully" }));
  });

  it("500 on db error", async () => {
    mockProduct.findOne.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { id: "p1" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.UserReview(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── categoryImages ──────────────────────────────────────────────────

describe("categoryImages", () => {
  beforeEach(() => jest.clearAllMocks());

  it("400 when no file uploaded", async () => {
    const req = { ...makeReq({ body: { id: "sb1", type: "image" } }), file: null };
    const res = makeRes();
    await ctrl.categoryImages(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Image file is required" }));
  });

  it("404 when sidebar category not found", async () => {
    mockCategory.findOne.mockResolvedValue(null);
    const req = {
      ...makeReq({ body: { id: "sb1", type: "image" } }),
      file: { path: "uploads/cat.jpg" },
    };
    const res = makeRes();
    await ctrl.categoryImages(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200 updates category successfully", async () => {
    const catObj = {
      side_bar_categories: [{ id: "sb1", image: null }],
    };
    mockCategory.findOne.mockResolvedValue(catObj);
    mockCategory.findOneAndUpdate.mockResolvedValue({ ...catObj });
    const req = {
      ...makeReq({ body: { id: "sb1", type: "image" } }),
      file: { path: "uploads/cat.jpg" },
    };
    const res = makeRes();
    await ctrl.categoryImages(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "image updated successfully" }));
  });

  it("500 on db error", async () => {
    mockCategory.findOne.mockRejectedValue(new Error("db"));
    const req = {
      ...makeReq({ body: { id: "sb1", type: "image" } }),
      file: { path: "uploads/cat.jpg" },
    };
    const res = makeRes();
    await ctrl.categoryImages(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
