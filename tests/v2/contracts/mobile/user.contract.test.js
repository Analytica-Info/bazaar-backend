/**
 * Contract tests — mobile user endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123", createdAt: new Date("2024-01-01") }; next(); },
  optional: () => (req, res, next) => { req.user = null; next(); },
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
jest.mock("../../../../src/controllers/v2/shared/productController", () =>
  stubAll(["getCategories", "getProducts", "getProductDetails", "search",
    "categoriesProduct", "subCategoriesProduct", "subSubCategoriesProduct", "similarProducts"])
);
jest.mock("../../../../src/controllers/v2/shared/wishlistController", () =>
  stubAll(["getWishlist", "addToWishlist", "removeFromWishlist", "toggleWishlist"])
);

jest.mock("../../../../src/services/userService", () => ({
  getProfile: jest.fn(),
  getUserOrders: jest.fn(),
  getOrder: jest.fn(),
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
const FAKE_USER = { _id: "u1", name: "Test", email: "t@test.com", role: "user" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/user/profile (mobile)", () => {
  test("200 — returns raw user object (not flattened)", async () => {
    userService.getProfile.mockResolvedValueOnce({ user: FAKE_USER, coupon: null });

    const res = await request(app).get("/v2/user/profile").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Mobile returns user object directly (no coupon field at top level)
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "_id": "u1",
        "email": "t@test.com",
        "name": "Test",
        "role": "user",
      }
    `);
    // Note: mobile does NOT include coupon in profile (web does — this is a divergence)
    expect(res.body.data).not.toHaveProperty("coupon");
  });
});

describe("GET /v2/user/orders (mobile)", () => {
  test("200 — returns order stats", async () => {
    userService.getUserOrders.mockResolvedValueOnce({
      orders: [],
      total_orders: 0,
      shipped_orders: 0,
      delivered_orders: 0,
      canceled_orders: 0,
    });

    const res = await request(app).get("/v2/user/orders").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("orders");
    expect(res.body.data).toHaveProperty("total_orders");
    expect(res.body.data).toHaveProperty("shipped_orders");
    expect(res.body.data).toHaveProperty("delivered_orders");
    expect(res.body.data).toHaveProperty("canceled_orders");
    expect(res.body).not.toHaveProperty("meta");
  });
});

describe("GET /v2/user/payment-history (mobile)", () => {
  test("200 — returns history array", async () => {
    userService.getPaymentHistory.mockResolvedValueOnce({ history: [] });

    const res = await request(app).get("/v2/user/payment-history").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("history");
  });
});

describe("GET /v2/user/dashboard (mobile)", () => {
  test("200 — returns dashboard object", async () => {
    userService.getDashboard.mockResolvedValueOnce({ totalSpent: 200 });

    const res = await request(app).get("/v2/user/dashboard").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSpent).toBe(200);
  });
});

describe("GET /v2/user/reviews (mobile)", () => {
  test("200 — returns products with reviews", async () => {
    userService.getUserReviews.mockResolvedValueOnce({ products: [] });

    const res = await request(app).get("/v2/user/reviews").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("products");
  });
});

describe("GET /v2/user/tabby-buyer-history (mobile)", () => {
  test("200 — returns tabby history", async () => {
    userService.getTabbyBuyerHistory.mockResolvedValueOnce({ purchases: [] });

    const res = await request(app).get("/v2/user/tabby-buyer-history").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("purchases");
  });

  test("web platform — tabby-buyer-history does NOT exist (404)", async () => {
    // This endpoint is mobile-only
    const res = await request(app).get("/v2/user/tabby-buyer-history")
      .set({ "X-Client": "web" });

    expect(res.status).toBe(404);
  });
});
