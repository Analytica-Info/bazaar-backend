/**
 * Contract tests — shared product endpoints (same for web and mobile).
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
  optional: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
}));
jest.mock("../../../../src/utilities/fileUpload", () => () => ({ single: () => (req, res, next) => next() }));

const stubAll = (names) => Object.fromEntries(names.map((n) => [n, (req, res) => res.json({ success: true, data: null })]));

jest.mock("../../../../src/controllers/v2/web/authController", () =>
  stubAll(["register", "login", "googleLogin", "appleLogin", "logout", "checkAuth",
    "forgotPassword", "verifyCode", "resetPassword", "updatePassword", "updateProfile",
    "getUserData", "deleteAccount", "verifyRecoveryCode", "resendRecoveryCode"])
);
jest.mock("../../../../src/controllers/v2/mobile/authController", () =>
  stubAll(["register", "login", "googleLogin", "appleLogin", "forgotPassword", "verifyCode",
    "resetPassword", "refreshToken", "checkAccessToken", "verifyRecoveryCode", "resendRecoveryCode",
    "updatePassword", "updateProfile", "getUserData", "deleteAccount"])
);
jest.mock("../../../../src/controllers/v2/web/userController", () =>
  stubAll(["getProfile", "getOrders", "getOrder", "getPaymentHistory", "getSinglePaymentHistory",
    "getDashboard", "getReviews", "getCurrentMonthCategories", "addReview"])
);
jest.mock("../../../../src/controllers/v2/mobile/userController", () =>
  stubAll(["getProfile", "getOrders", "getOrder", "getPaymentHistory", "getSinglePaymentHistory",
    "getDashboard", "getReviews", "getTabbyBuyerHistory"])
);
jest.mock("../../../../src/controllers/v2/web/orderController", () =>
  stubAll(["getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "validateInventory"])
);
jest.mock("../../../../src/controllers/v2/mobile/orderController", () =>
  stubAll(["getOrders", "validateInventory", "checkoutStripe", "checkoutTabby", "verifyTabby",
    "checkoutNomod", "verifyNomod", "initStripePayment", "getPaymentMethods",
    "getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "updateOrderStatus"])
);
jest.mock("../../../../src/controllers/v2/web/cartController", () =>
  stubAll(["getCart", "addToCart", "removeFromCart", "increaseQty", "decreaseQty"])
);
jest.mock("../../../../src/controllers/v2/mobile/cartController", () =>
  stubAll(["getCart", "addToCart", "removeFromCart", "increaseQty", "decreaseQty"])
);
jest.mock("../../../../src/controllers/v2/web/notificationController", () =>
  stubAll(["getNotifications", "markRead"])
);
jest.mock("../../../../src/controllers/v2/mobile/notificationController", () =>
  stubAll(["getNotifications", "markRead", "trackClick"])
);
jest.mock("../../../../src/controllers/v2/shared/wishlistController", () =>
  stubAll(["getWishlist", "addToWishlist", "removeFromWishlist", "toggleWishlist"])
);

jest.mock("../../../../src/services/productService", () => ({
  getCategories: jest.fn(),
  getProducts: jest.fn(),
  getProductDetails: jest.fn(),
  searchProducts: jest.fn(),
  getCategoriesProduct: jest.fn(),
  getSubCategoriesProduct: jest.fn(),
  getSubSubCategoriesProduct: jest.fn(),
  getSimilarProducts: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const productService = require("../../../../src/services/productService");

const WEB = { "X-Client": "web" };
const MOBILE = { "X-Client": "mobile" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/products (shared)", () => {
  test("200 web — returns categories data in envelope", async () => {
    productService.getProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const res = await request(app).get("/v2/products").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body)).toEqual(["success", "data"]);
  });

  test("200 mobile — same shape", async () => {
    productService.getProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const res = await request(app).get("/v2/products").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /v2/products/categories", () => {
  test("200 — returns categories", async () => {
    productService.getCategories.mockResolvedValueOnce({ categories: ["Electronics"] });

    const res = await request(app).get("/v2/products/categories").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("categories");
  });
});

describe("GET /v2/products/:id", () => {
  test("200 — returns product details", async () => {
    productService.getProductDetails.mockResolvedValueOnce({ product: { name: "Laptop" } });

    const res = await request(app).get("/v2/products/prod1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("product");
  });

  test("404 — product not found", async () => {
    productService.getProductDetails.mockRejectedValueOnce({ status: 404, message: "Not found" });

    const res = await request(app).get("/v2/products/bad-id").set(WEB);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /v2/products/search", () => {
  test("200 — returns search results", async () => {
    productService.searchProducts.mockResolvedValueOnce({ results: [], total: 0 });

    const res = await request(app).post("/v2/products/search").set(WEB)
      .send({ query: "laptop" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /v2/products/similar", () => {
  test("200 — returns similar products", async () => {
    productService.getSimilarProducts.mockResolvedValueOnce({ products: [] });

    const res = await request(app)
      .get("/v2/products/similar?product_type_id=pt1&id=p1")
      .set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// Error path matrix for shared product controller
describe.each([
  { label: "getCategories",   method: "get",  path: "/v2/products/categories", mockFn: "getCategories",  body: null },
  { label: "getProducts",     method: "get",  path: "/v2/products",             mockFn: "getProducts",    body: null },
  { label: "search",          method: "post", path: "/v2/products/search",      mockFn: "searchProducts", body: { query: "x" } },
])("error path: $label (shared products)", ({ method, path, mockFn, body }) => {
  test("500 — service throws returns error envelope", async () => {
    productService[mockFn].mockRejectedValueOnce({ status: 500, message: "DB error" });

    const req = request(app)[method](path).set(WEB);
    const res = body ? await req.send(body) : await req;

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

describe("GET /v2/products/category/:id — error paths (shared)", () => {
  test("200 — returns categories product", async () => {
    productService.getCategoriesProduct.mockResolvedValueOnce({ products: [] });

    const res = await request(app).get("/v2/products/category/cat1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("500 — service throws returns error envelope", async () => {
    productService.getCategoriesProduct.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/products/category/cat1").set(WEB);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/products/sub-category/:id — error paths (shared)", () => {
  test("200 — returns sub-categories product", async () => {
    productService.getSubCategoriesProduct.mockResolvedValueOnce({ products: [] });

    const res = await request(app).get("/v2/products/sub-category/sc1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("500 — service throws returns error envelope", async () => {
    productService.getSubCategoriesProduct.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/products/sub-category/sc1").set(WEB);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/products/sub-sub-category/:id — error paths (shared)", () => {
  test("200 — returns sub-sub-categories product", async () => {
    productService.getSubSubCategoriesProduct.mockResolvedValueOnce({ products: [] });

    const res = await request(app).get("/v2/products/sub-sub-category/ssc1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("500 — service throws returns error envelope", async () => {
    productService.getSubSubCategoriesProduct.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/products/sub-sub-category/ssc1").set(WEB);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
