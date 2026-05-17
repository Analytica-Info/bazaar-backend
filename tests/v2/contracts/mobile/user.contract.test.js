/**
 * Contract tests — mobile user/me endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123", createdAt: new Date("2024-01-01") }; next(); },
  optional: () => (req, res, next) => { req.user = null; next(); },
}));
jest.mock("../../../../src/utilities/fileUpload", () => () => ({ single: () => (req, res, next) => next() }));

const stubAll = (_names) => new Proxy({}, { get: () => (req, res) => res.json({ success: true, data: null }) });

jest.mock("../../../../src/controllers/v2/web/authController", () =>
  stubAll(["register", "login", "loginGoogle", "loginApple", "logout", "getSession",
    "passwordForgot", "passwordVerifyCode", "passwordReset", "updatePassword", "updateMe",
    "getMe", "deleteMe", "verifyRecovery", "resendRecovery"])
);
jest.mock("../../../../src/controllers/v2/mobile/authController", () =>
  stubAll(["register", "login", "loginGoogle", "loginApple", "passwordForgot", "passwordVerifyCode",
    "passwordReset", "refresh", "getSession", "verifyRecovery", "resendRecovery",
    "updatePassword", "updateMe", "getMe", "deleteMe"])
);
jest.mock("../../../../src/controllers/v2/web/userController", () =>
  stubAll(["getOrders", "getOrder", "getPaymentHistory", "getSinglePaymentHistory",
    "getDashboard", "getReviews", "getCurrentMonthCategories", "addReview"])
);
jest.mock("../../../../src/controllers/v2/web/orderController", () =>
  stubAll(["getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "validateInventory",
    "checkoutNomod", "verifyNomod"])
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
  stubAll(["getNotifications", "updateReadState", "markRead"])
);
jest.mock("../../../../src/controllers/v2/mobile/notificationController", () =>
  stubAll(["getNotifications", "updateReadState", "markRead", "recordClick", "trackClick"])
);
jest.mock("../../../../src/controllers/v2/shared/productController", () =>
  stubAll(["listCategories", "searchCategories", "getProducts", "getProductDetails", "search",
    "listCategoryProducts", "listSimilarProducts"])
);
jest.mock("../../../../src/controllers/v2/shared/wishlistController", () =>
  stubAll(["getWishlist", "addItem", "removeItem", "addToWishlist", "removeFromWishlist"])
);

jest.mock("../../../../src/services/userService", () => ({
  getPaymentHistory: jest.fn(),
  getSinglePaymentHistory: jest.fn(),
  getDashboard: jest.fn(),
  getUserReviews: jest.fn(),
  getTabbyBuyerHistory: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const userService = require("../../../../src/services/userService");

const MOBILE = { "X-Client": "mobile" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/me/payments (mobile)", () => {
  test("200 — returns history array", async () => {
    userService.getPaymentHistory.mockResolvedValueOnce({ history: [] });

    const res = await request(app).get("/v2/me/payments").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("history");
  });
});

describe("GET /v2/me/dashboard (mobile)", () => {
  test("200 — returns dashboard object", async () => {
    userService.getDashboard.mockResolvedValueOnce({ totalSpent: 200 });

    const res = await request(app).get("/v2/me/dashboard").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSpent).toBe(200);
  });
});

describe("GET /v2/me/reviews (mobile)", () => {
  test("200 — returns products with reviews", async () => {
    userService.getUserReviews.mockResolvedValueOnce({ products: [] });

    const res = await request(app).get("/v2/me/reviews").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("products");
  });
});

describe("GET /v2/me/payments/tabby/history (mobile)", () => {
  test("200 — returns tabby history", async () => {
    userService.getTabbyBuyerHistory.mockResolvedValueOnce({ purchases: [] });

    const res = await request(app).get("/v2/me/payments/tabby/history").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("purchases");
  });

  test("web platform — tabby history does NOT exist (404)", async () => {
    // This endpoint is mobile-only
    const res = await request(app).get("/v2/me/payments/tabby/history")
      .set({ "X-Client": "web" });

    expect(res.status).toBe(404);
  });
});

// Error path matrix for mobile user controller
describe.each([
  {
    label: "getPaymentHistory",
    method: "get", path: "/v2/me/payments",
    mockFn: "getPaymentHistory",
    body: null,
  },
  {
    label: "getDashboard",
    method: "get", path: "/v2/me/dashboard",
    mockFn: "getDashboard",
    body: null,
  },
  {
    label: "getReviews",
    method: "get", path: "/v2/me/reviews",
    mockFn: "getUserReviews",
    body: null,
  },
  {
    label: "getTabbyBuyerHistory",
    method: "get", path: "/v2/me/payments/tabby/history",
    mockFn: "getTabbyBuyerHistory",
    body: null,
  },
])("error path: $label (mobile)", ({ method, path, mockFn, body }) => {
  test("500 — service throws returns error envelope", async () => {
    userService[mockFn].mockRejectedValueOnce({ status: 500, message: "DB error" });

    const req = request(app)[method](path).set(MOBILE);
    const res = body ? await req.send(body) : await req;

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

describe("GET /v2/me/payments/:id — error path (mobile)", () => {
  test("404 — not found returns error envelope", async () => {
    userService.getSinglePaymentHistory.mockRejectedValueOnce({ status: 404, message: "Not found" });

    const res = await request(app).get("/v2/me/payments/bad").set(MOBILE);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
