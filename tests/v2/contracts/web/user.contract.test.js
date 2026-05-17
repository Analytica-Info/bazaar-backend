/**
 * Contract tests — web user/me endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
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
jest.mock("../../../../src/controllers/v2/mobile/userController", () =>
  stubAll(["getPaymentHistory", "getSinglePaymentHistory",
    "getDashboard", "getReviews", "getTabbyBuyerHistory"])
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
  getProfile: jest.fn(),
  getUserOrders: jest.fn(),
  getOrder: jest.fn(),
  getPaymentHistory: jest.fn(),
  getSinglePaymentHistory: jest.fn(),
  getDashboard: jest.fn(),
  getUserReviews: jest.fn(),
  getCurrentMonthOrderCategories: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const userService = require("../../../../src/services/userService");

const WEB = { "X-Client": "web" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/orders (web)", () => {
  test("200 — returns order stats and orders array", async () => {
    userService.getUserOrders.mockResolvedValueOnce({
      orders: [{ orderId: "o1" }],
      total_orders: 1,
      shipped_orders: 0,
      delivered_orders: 1,
      canceled_orders: 0,
    });

    const res = await request(app).get("/v2/orders").set(WEB);

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

describe("GET /v2/orders/:id (web)", () => {
  test("200 — returns specific order wrapped", async () => {
    userService.getOrder.mockResolvedValueOnce({ orders: [{ orderId: "o1" }] });

    const res = await request(app).get("/v2/orders/o1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("orders");
  });

  test("404 — order not found", async () => {
    userService.getOrder.mockRejectedValueOnce({ status: 404, message: "Order not found" });

    const res = await request(app).get("/v2/orders/bad").set(WEB);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /v2/me/payments (web)", () => {
  test("200 — returns history array", async () => {
    userService.getPaymentHistory.mockResolvedValueOnce({ history: [{ paymentId: "pay1" }] });

    const res = await request(app).get("/v2/me/payments").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("history");
    expect(Array.isArray(res.body.data.history)).toBe(true);
  });
});

describe("GET /v2/me/payments/:id (web)", () => {
  test("200 — returns single history entry", async () => {
    userService.getSinglePaymentHistory.mockResolvedValueOnce({ history: { paymentId: "pay1" } });

    const res = await request(app).get("/v2/me/payments/pay1").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("history");
  });
});

describe("GET /v2/me/dashboard (web)", () => {
  test("200 — returns dashboard data", async () => {
    userService.getDashboard.mockResolvedValueOnce({ totalSpent: 500, totalOrders: 3 });

    const res = await request(app).get("/v2/me/dashboard").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSpent).toBe(500);
  });
});

describe("GET /v2/me/reviews (web)", () => {
  test("200 — returns products with reviews", async () => {
    userService.getUserReviews.mockResolvedValueOnce({ products: [{ productId: "prod1" }] });

    const res = await request(app).get("/v2/me/reviews").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("products");
  });
});

describe("GET /v2/me/dashboard/current-month-categories (web)", () => {
  test("200 — returns categories data with message", async () => {
    userService.getCurrentMonthOrderCategories.mockResolvedValueOnce({
      data: ["Electronics", "Clothing"],
      message: "Categories retrieved",
    });

    const res = await request(app).get("/v2/me/dashboard/current-month-categories").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Categories retrieved");
  });
});

// Error path matrix for web user controller
describe.each([
  { label: "getOrders",                 method: "get",  path: "/v2/orders",                                    mockFn: "getUserOrders",                  body: null },
  { label: "getPaymentHistory",         method: "get",  path: "/v2/me/payments",                               mockFn: "getPaymentHistory",              body: null },
  { label: "getDashboard",              method: "get",  path: "/v2/me/dashboard",                              mockFn: "getDashboard",                   body: null },
  { label: "getReviews",                method: "get",  path: "/v2/me/reviews",                                mockFn: "getUserReviews",                 body: null },
  { label: "getCurrentMonthCategories", method: "get",  path: "/v2/me/dashboard/current-month-categories",     mockFn: "getCurrentMonthOrderCategories", body: null },
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

describe("GET /v2/me/payments/:id — error path (web)", () => {
  test("404 — not found returns error envelope", async () => {
    userService.getSinglePaymentHistory.mockRejectedValueOnce({ status: 404, message: "Not found" });

    const res = await request(app).get("/v2/me/payments/bad").set(WEB);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
