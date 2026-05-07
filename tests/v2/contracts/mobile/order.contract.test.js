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

describe("GET /v2/orders — error paths (mobile)", () => {
  test("500 — getOrders throws returns error envelope", async () => {
    orderService.getOrders.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/orders").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

describe("GET /v2/orders/address — error path (mobile)", () => {
  test("500 — getAddresses throws returns error envelope", async () => {
    orderService.getAddresses.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/orders/address").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/validate-inventory — error path (mobile)", () => {
  test("500 — service error propagates", async () => {
    orderService.validateInventoryBeforeCheckout.mockRejectedValueOnce({ status: 500, message: "Internal" });

    const res = await request(app).post("/v2/orders/validate-inventory").set(MOBILE)
      .send({ products: [] });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/checkout/tabby — error path (mobile)", () => {
  test("500 — service error propagates", async () => {
    orderService.createTabbyCheckoutSession.mockRejectedValueOnce({ status: 500, message: "Tabby error" });

    const res = await request(app).post("/v2/orders/checkout/tabby").set(MOBILE)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/orders/verify/tabby (mobile)", () => {
  test("200 — returns finalStatus", async () => {
    orderService.verifyTabbyPayment.mockResolvedValueOnce({
      finalStatus: "authorized",
      message: "Payment verified",
    });

    const res = await request(app).get("/v2/orders/verify/tabby?paymentId=tab123").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("finalStatus");
  });

  test("500 — service error propagates", async () => {
    orderService.verifyTabbyPayment.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).get("/v2/orders/verify/tabby?paymentId=bad").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/checkout/nomod (mobile)", () => {
  test("200 — returns paymentId and status", async () => {
    orderService.createNomodCheckoutSession.mockResolvedValueOnce({
      paymentId: "nom123",
      status: "pending",
      message: "Nomod checkout created",
    });

    const res = await request(app).post("/v2/orders/checkout/nomod").set(MOBILE)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("paymentId");
    expect(res.body.data).toHaveProperty("status");
  });

  test("500 — service error propagates", async () => {
    orderService.createNomodCheckoutSession.mockRejectedValueOnce({ status: 500, message: "Nomod error" });

    const res = await request(app).post("/v2/orders/checkout/nomod").set(MOBILE)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/orders/verify/nomod (mobile)", () => {
  test("200 — returns finalStatus", async () => {
    orderService.verifyNomodPayment.mockResolvedValueOnce({
      finalStatus: "captured",
      message: "Nomod verified",
    });

    const res = await request(app).get("/v2/orders/verify/nomod?paymentId=nom123").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("finalStatus");
  });

  test("500 — service error propagates", async () => {
    orderService.verifyNomodPayment.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).get("/v2/orders/verify/nomod?paymentId=bad").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/stripe/init — validation matrix (mobile)", () => {
  test.each([
    ["zero amountAED", { amountAED: 0 }],
    ["string amountAED", { amountAED: "abc" }],
    ["null body", {}],
  ])("400 — %s returns BAD_REQUEST", async (_label, body) => {
    const res = await request(app).post("/v2/orders/stripe/init").set(MOBILE).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("500 — service error propagates", async () => {
    orderService.initStripePayment.mockRejectedValueOnce({ status: 500, message: "Stripe failure" });

    const res = await request(app).post("/v2/orders/stripe/init").set(MOBILE)
      .send({ amountAED: 100 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/orders/payment-methods — error path (mobile)", () => {
  test("500 — service throws returns error envelope", async () => {
    orderService.getPaymentMethods.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/orders/payment-methods").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/address (mobile)", () => {
  test("200 — stores address and returns addresses", async () => {
    orderService.storeAddress.mockResolvedValueOnce({
      addresses: [{ name: "Home", city: "Dubai" }],
      message: "Address saved",
    });

    const res = await request(app).post("/v2/orders/address").set(MOBILE)
      .send({ name: "Home", city: "Dubai", country: "AE" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("addresses");
  });

  test("500 — error path", async () => {
    orderService.storeAddress.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).post("/v2/orders/address").set(MOBILE)
      .send({ name: "Home" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("DELETE /v2/orders/address/:addressId (mobile)", () => {
  test("200 — deletes address", async () => {
    orderService.deleteAddress.mockResolvedValueOnce({ addresses: [] });

    const res = await request(app).delete("/v2/orders/address/addr1").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("addresses");
  });

  test("500 — error path", async () => {
    orderService.deleteAddress.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).delete("/v2/orders/address/bad").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("PATCH /v2/orders/address/:addressId/set-primary (mobile)", () => {
  test("200 — sets primary address", async () => {
    orderService.setPrimaryAddress.mockResolvedValueOnce({ addresses: [{ isPrimary: true }] });

    const res = await request(app).patch("/v2/orders/address/addr1/set-primary").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("addresses");
  });

  test("500 — error path", async () => {
    orderService.setPrimaryAddress.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).patch("/v2/orders/address/bad/set-primary").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("PATCH /v2/orders/:orderId/status (mobile)", () => {
  test("200 — updates order status", async () => {
    orderService.updateOrderStatus.mockResolvedValueOnce({ order: { _id: "o1", status: "delivered" } });

    const res = await request(app).patch("/v2/orders/o1/status").set(MOBILE)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("order");
  });

  test("500 — error path", async () => {
    orderService.updateOrderStatus.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).patch("/v2/orders/bad/status").set(MOBILE)
      .send({ status: "delivered" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
