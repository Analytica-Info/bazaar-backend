/**
 * Contract tests — web user endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
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
  getCurrentMonthOrderCategories: jest.fn(),
  addReview: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const userService = require("../../../../src/services/userService");

const WEB = { "X-Client": "web" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/user/profile (web)", () => {
  test("200 — returns flattened profile fields", async () => {
    userService.getProfile.mockResolvedValueOnce({
      user: { name: "Test", email: "t@t.com", avatar: null, username: "test",
        role: "user", phone: "555", authProvider: "local" },
      coupon: "SAVE10",
    });

    const res = await request(app).get("/v2/user/profile").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "avatar": null,
        "coupon": "SAVE10",
        "email": "t@t.com",
        "name": "Test",
        "phone": "555",
        "provider": "local",
        "role": "user",
        "username": "test",
      }
    `);
  });
});

describe("GET /v2/user/orders (web)", () => {
  test("200 — returns order stats and orders array", async () => {
    userService.getUserOrders.mockResolvedValueOnce({
      orders: [{ orderId: "o1" }],
      total_orders: 1,
      shipped_orders: 0,
      delivered_orders: 1,
      canceled_orders: 0,
    });

    const res = await request(app).get("/v2/user/orders").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("orders");
    expect(res.body.data).toHaveProperty("total_orders");
    expect(res.body.data).toHaveProperty("shipped_orders");
    expect(res.body.data).toHaveProperty("delivered_orders");
    expect(res.body.data).toHaveProperty("canceled_orders");
    // No pagination meta — this uses wrap, not paginated
    expect(res.body).not.toHaveProperty("meta");
  });
});

describe("GET /v2/user/orders/:id (web)", () => {
  test("200 — returns specific order wrapped", async () => {
    userService.getOrder.mockResolvedValueOnce({ orders: [{ orderId: "o1" }] });

    const res = await request(app).get("/v2/user/orders/o1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("orders");
  });

  test("404 — order not found", async () => {
    userService.getOrder.mockRejectedValueOnce({ status: 404, message: "Order not found" });

    const res = await request(app).get("/v2/user/orders/bad").set(WEB);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /v2/user/payment-history (web)", () => {
  test("200 — returns history array", async () => {
    userService.getPaymentHistory.mockResolvedValueOnce({ history: [{ paymentId: "pay1" }] });

    const res = await request(app).get("/v2/user/payment-history").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("history");
    expect(Array.isArray(res.body.data.history)).toBe(true);
  });
});

describe("GET /v2/user/payment-history/:id (web)", () => {
  test("200 — returns single history entry", async () => {
    userService.getSinglePaymentHistory.mockResolvedValueOnce({ history: { paymentId: "pay1" } });

    const res = await request(app).get("/v2/user/payment-history/pay1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("history");
  });
});

describe("GET /v2/user/dashboard (web)", () => {
  test("200 — returns dashboard data", async () => {
    userService.getDashboard.mockResolvedValueOnce({ totalSpent: 500, totalOrders: 3 });

    const res = await request(app).get("/v2/user/dashboard").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSpent).toBe(500);
  });
});

describe("GET /v2/user/reviews (web)", () => {
  test("200 — returns products with reviews", async () => {
    userService.getUserReviews.mockResolvedValueOnce({ products: [{ productId: "prod1" }] });

    const res = await request(app).get("/v2/user/reviews").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("products");
  });
});

describe("GET /v2/user/current-month-categories (web)", () => {
  test("200 — returns categories data with message", async () => {
    userService.getCurrentMonthOrderCategories.mockResolvedValueOnce({
      data: ["Electronics", "Clothing"],
      message: "Categories retrieved",
    });

    const res = await request(app).get("/v2/user/current-month-categories").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Categories retrieved");
  });
});
