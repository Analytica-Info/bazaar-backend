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

// Error path matrix for web user controller
describe.each([
  { label: "getProfile",                method: "get",  path: "/v2/user/profile",                    mockFn: "getProfile",                     body: null },
  { label: "getOrders",                 method: "get",  path: "/v2/user/orders",                     mockFn: "getUserOrders",                  body: null },
  { label: "getPaymentHistory",         method: "get",  path: "/v2/user/payment-history",            mockFn: "getPaymentHistory",              body: null },
  { label: "getDashboard",              method: "get",  path: "/v2/user/dashboard",                  mockFn: "getDashboard",                   body: null },
  { label: "getReviews",                method: "get",  path: "/v2/user/reviews",                    mockFn: "getUserReviews",                 body: null },
  { label: "getCurrentMonthCategories", method: "get",  path: "/v2/user/current-month-categories",   mockFn: "getCurrentMonthOrderCategories", body: null },
])("error path: $label (web)", ({ method, path, mockFn, body }) => {
  test("500 — service throws returns error envelope", async () => {
    userService[mockFn].mockRejectedValueOnce({ status: 500, message: "DB error" });

    const req = request(app)[method](path).set(WEB);
    const res = body ? await req.send(body) : await req;

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /v2/user/reviews (web)", () => {
  test("200 — adds review successfully", async () => {
    userService.addReview.mockResolvedValueOnce({ reviews: [], message: "Review added" });

    const res = await request(app).post("/v2/user/reviews").set(WEB)
      .send({
        product_id: "prod1",
        name: "Test User",
        title: "Great product",
        description: "Loved it",
        quality_rating: 5,
        value_rating: 4,
        price_rating: 4,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("reviews");
    expect(res.body.message).toBe("Review added");
  });

  test("500 — service error propagates", async () => {
    userService.addReview.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).post("/v2/user/reviews").set(WEB)
      .send({ product_id: "prod1", name: "Test" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/user/payment-history/:id — error path (web)", () => {
  test("404 — not found returns error envelope", async () => {
    userService.getSinglePaymentHistory.mockRejectedValueOnce({ status: 404, message: "Not found" });

    const res = await request(app).get("/v2/user/payment-history/bad").set(WEB);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
