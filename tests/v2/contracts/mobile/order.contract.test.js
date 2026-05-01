/**
 * Contract tests — mobile order endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123", fcmToken: null }; next(); },
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
jest.mock("../../../../src/controllers/v2/mobile/userController", () =>
  stubAll(["getProfile", "getOrders", "getOrder", "getPaymentHistory", "getSinglePaymentHistory",
    "getDashboard", "getReviews", "getTabbyBuyerHistory"])
);
jest.mock("../../../../src/controllers/v2/web/orderController", () =>
  stubAll(["getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "validateInventory"])
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

jest.mock("../../../../src/services/orderService", () => ({
  getOrders: jest.fn(),
  validateInventoryBeforeCheckout: jest.fn(),
  createStripeCheckoutSession: jest.fn(),
  createTabbyCheckoutSession: jest.fn(),
  verifyTabbyPayment: jest.fn(),
  createNomodCheckoutSession: jest.fn(),
  verifyNomodPayment: jest.fn(),
  initStripePayment: jest.fn(),
  getPaymentMethods: jest.fn(),
  getAddresses: jest.fn(),
  storeAddress: jest.fn(),
  deleteAddress: jest.fn(),
  setPrimaryAddress: jest.fn(),
  updateOrderStatus: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const orderService = require("../../../../src/services/orderService");

const MOBILE = { "X-Client": "mobile" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/orders (mobile)", () => {
  test("200 — returns paginated orders", async () => {
    orderService.getOrders.mockResolvedValueOnce({
      orders: [{ orderId: "o1" }],
      total: 10,
      page: 1,
      limit: 20,
    });

    const res = await request(app).get("/v2/orders").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body)).toEqual(["success", "data", "meta"]);
    expect(res.body.meta).toMatchInlineSnapshot(`
      {
        "limit": 20,
        "page": 1,
        "pages": 1,
        "total": 10,
      }
    `);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("200 — custom page/limit params forwarded", async () => {
    orderService.getOrders.mockResolvedValueOnce({ orders: [], total: 0, page: 2, limit: 5 });

    await request(app).get("/v2/orders?page=2&limit=5").set(MOBILE);

    expect(orderService.getOrders).toHaveBeenCalledWith("user123", { page: 2, limit: 5 });
  });
});

describe("POST /v2/orders/validate-inventory (mobile)", () => {
  test("200 — returns isValid and results", async () => {
    orderService.validateInventoryBeforeCheckout.mockResolvedValueOnce({
      isValid: true,
      results: [],
      message: "OK",
    });

    const res = await request(app).post("/v2/orders/validate-inventory").set(MOBILE)
      .send({ products: [] });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("isValid");
    expect(res.body.data).toHaveProperty("results");
  });
});

describe("POST /v2/orders/checkout/stripe (mobile)", () => {
  test("200 — returns orderId", async () => {
    orderService.createStripeCheckoutSession.mockResolvedValueOnce({
      orderId: "ord123",
      message: "Order created",
    });

    const res = await request(app).post("/v2/orders/checkout/stripe").set(MOBILE)
      .send({ addressId: "addr1" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "orderId": "ord123",
      }
    `);
    expect(res.body.message).toBe("Order created");
  });

  test("500 — service failure returns error envelope", async () => {
    orderService.createStripeCheckoutSession.mockRejectedValueOnce({ status: 500, message: "Stripe error" });

    const res = await request(app).post("/v2/orders/checkout/stripe").set(MOBILE)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("POST /v2/orders/checkout/tabby (mobile)", () => {
  test("200 — returns paymentId and status", async () => {
    orderService.createTabbyCheckoutSession.mockResolvedValueOnce({
      paymentId: "tab123",
      status: "pending",
      message: "Tabby checkout created",
    });

    const res = await request(app).post("/v2/orders/checkout/tabby").set(MOBILE)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("paymentId");
    expect(res.body.data).toHaveProperty("status");
  });
});

describe("POST /v2/orders/stripe/init (mobile)", () => {
  test("200 — returns stripe init data", async () => {
    orderService.initStripePayment.mockResolvedValueOnce({ clientSecret: "cs_test_123" });

    const res = await request(app).post("/v2/orders/stripe/init").set(MOBILE)
      .send({ amountAED: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data.clientSecret).toBe("cs_test_123");
  });

  test("400 — missing amountAED returns BAD_REQUEST", async () => {
    const res = await request(app).post("/v2/orders/stripe/init").set(MOBILE)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("400 — negative amountAED returns BAD_REQUEST", async () => {
    const res = await request(app).post("/v2/orders/stripe/init").set(MOBILE)
      .send({ amountAED: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});

describe("GET /v2/orders/payment-methods (mobile)", () => {
  test("200 — returns available methods", async () => {
    orderService.getPaymentMethods.mockResolvedValueOnce(["stripe", "tabby", "nomod"]);

    const res = await request(app).get("/v2/orders/payment-methods").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data.methods).toEqual(["stripe", "tabby", "nomod"]);
  });
});

describe("GET /v2/orders/address (mobile)", () => {
  test("200 — returns address and flag", async () => {
    orderService.getAddresses.mockResolvedValueOnce({ address: [], flag: "AE" });

    const res = await request(app).get("/v2/orders/address").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("address");
    expect(res.body.data).toHaveProperty("flag");
  });
});
