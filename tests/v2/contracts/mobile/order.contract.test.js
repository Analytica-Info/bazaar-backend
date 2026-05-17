'use strict';
/**
 * Contract tests — mobile order + address endpoints (Wave 2 URLs).
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123", fcmToken: null }; next(); },
  optional: () => (req, res, next) => { req.user = null; next(); },
}));
jest.mock("../../../../src/utilities/fileUpload", () => () => ({ single: () => (req, res, next) => next() }));

const stubAll = (_names) => new Proxy({}, { get: () => (req, res) => res.json({ success: true, data: null }) });

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
  stubAll(["listAddresses", "createAddress", "deleteAddress", "updateAddress",
    "createInventoryCheck", "createNomodCheckout", "verifyNomodCheckout"])
);
jest.mock("../../../../src/controllers/v2/web/cartController", () =>
  stubAll(["getCart", "addItem", "removeItem", "updateItemQuantity"])
);
jest.mock("../../../../src/controllers/v2/mobile/cartController", () =>
  stubAll(["getCart", "addItem", "removeItem", "updateItemQuantity"])
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
  updateAddress: jest.fn(),
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

describe("POST /v2/orders/inventory-checks (mobile)", () => {
  test("200 — returns isValid and results", async () => {
    orderService.validateInventoryBeforeCheckout.mockResolvedValueOnce({
      isValid: true,
      results: [],
      message: "OK",
    });

    const res = await request(app).post("/v2/orders/inventory-checks").set(MOBILE)
      .send({ products: [] });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("isValid");
    expect(res.body.data).toHaveProperty("results");
  });
});

describe("POST /v2/orders/checkouts/stripe (mobile)", () => {
  test("200 — returns orderId", async () => {
    orderService.createStripeCheckoutSession.mockResolvedValueOnce({
      orderId: "ord123",
      message: "Order created",
    });

    const res = await request(app).post("/v2/orders/checkouts/stripe").set(MOBILE)
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

    const res = await request(app).post("/v2/orders/checkouts/stripe").set(MOBILE)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("POST /v2/orders/checkouts/tabby (mobile)", () => {
  test("200 — returns paymentId and status", async () => {
    orderService.createTabbyCheckoutSession.mockResolvedValueOnce({
      paymentId: "tab123",
      status: "pending",
      message: "Tabby checkout created",
    });

    const res = await request(app).post("/v2/orders/checkouts/tabby").set(MOBILE)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("paymentId");
    expect(res.body.data).toHaveProperty("status");
  });

  test("500 — service error propagates", async () => {
    orderService.createTabbyCheckoutSession.mockRejectedValueOnce({ status: 500, message: "Tabby error" });

    const res = await request(app).post("/v2/orders/checkouts/tabby").set(MOBILE)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/checkouts/tabby/verify (mobile)", () => {
  test("200 — returns finalStatus (paymentId from body)", async () => {
    orderService.verifyTabbyPayment.mockResolvedValueOnce({
      finalStatus: "authorized",
      message: "Payment verified",
    });

    const res = await request(app).post("/v2/orders/checkouts/tabby/verify").set(MOBILE)
      .send({ paymentId: "tab123" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("finalStatus");
  });

  test("500 — service error propagates", async () => {
    orderService.verifyTabbyPayment.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).post("/v2/orders/checkouts/tabby/verify").set(MOBILE)
      .send({ paymentId: "bad" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/checkouts/nomod (mobile)", () => {
  test("200 — returns paymentId and status", async () => {
    // Service returns snake_case; controller maps to camelCase v2 envelope.
    orderService.createNomodCheckoutSession.mockResolvedValueOnce({
      payment_id: "nom123",
      checkout_url: "https://pay.nomod.com/nom123",
      status: "pending",
      message: "Nomod checkout created",
    });

    const res = await request(app).post("/v2/orders/checkouts/nomod").set(MOBILE)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("paymentId");
    expect(res.body.data).toHaveProperty("checkoutUrl");
    expect(res.body.data).toHaveProperty("status");
  });

  test("500 — service error propagates", async () => {
    orderService.createNomodCheckoutSession.mockRejectedValueOnce({ status: 500, message: "Nomod error" });

    const res = await request(app).post("/v2/orders/checkouts/nomod").set(MOBILE)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/checkouts/nomod/verify (mobile)", () => {
  test("200 — returns finalStatus (paymentId from body)", async () => {
    orderService.verifyNomodPayment.mockResolvedValueOnce({
      finalStatus: "captured",
      message: "Nomod verified",
    });

    const res = await request(app).post("/v2/orders/checkouts/nomod/verify").set(MOBILE)
      .send({ paymentId: "nom123" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("finalStatus");
  });

  test("500 — service error propagates", async () => {
    orderService.verifyNomodPayment.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).post("/v2/orders/checkouts/nomod/verify").set(MOBILE)
      .send({ paymentId: "bad" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/orders/checkouts/stripe/init (mobile)", () => {
  test("200 — returns stripe init data", async () => {
    orderService.initStripePayment.mockResolvedValueOnce({ clientSecret: "cs_test_123" });

    const res = await request(app).post("/v2/orders/checkouts/stripe/init").set(MOBILE)
      .send({ amountAED: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data.clientSecret).toBe("cs_test_123");
  });

  test("400 — missing amountAED returns BAD_REQUEST", async () => {
    const res = await request(app).post("/v2/orders/checkouts/stripe/init").set(MOBILE)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("400 — negative amountAED returns BAD_REQUEST", async () => {
    const res = await request(app).post("/v2/orders/checkouts/stripe/init").set(MOBILE)
      .send({ amountAED: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});

describe("POST /v2/orders/checkouts/stripe/init — validation matrix (mobile)", () => {
  test.each([
    ["zero amountAED", { amountAED: 0 }],
    ["string amountAED", { amountAED: "abc" }],
    ["null body", {}],
  ])("400 — %s returns BAD_REQUEST", async (_label, body) => {
    const res = await request(app).post("/v2/orders/checkouts/stripe/init").set(MOBILE).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("500 — service error propagates", async () => {
    orderService.initStripePayment.mockRejectedValueOnce({ status: 500, message: "Stripe failure" });

    const res = await request(app).post("/v2/orders/checkouts/stripe/init").set(MOBILE)
      .send({ amountAED: 100 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/payment-methods (mobile)", () => {
  test("200 — returns available methods", async () => {
    orderService.getPaymentMethods.mockResolvedValueOnce(["stripe", "tabby", "nomod"]);

    const res = await request(app).get("/v2/payment-methods").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data.methods).toEqual(["stripe", "tabby", "nomod"]);
  });

  test("500 — service throws returns error envelope", async () => {
    orderService.getPaymentMethods.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/payment-methods").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /v2/me/addresses (mobile)", () => {
  test("200 — returns address and flag", async () => {
    orderService.getAddresses.mockResolvedValueOnce({ address: [], flag: "AE" });

    const res = await request(app).get("/v2/me/addresses").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("address");
    expect(res.body.data).toHaveProperty("flag");
  });

  test("500 — getAddresses throws returns error envelope", async () => {
    orderService.getAddresses.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/me/addresses").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/me/addresses (mobile)", () => {
  test("200 — stores address and returns addresses", async () => {
    orderService.storeAddress.mockResolvedValueOnce({
      addresses: [{ name: "Home", city: "Dubai" }],
      message: "Address saved",
    });

    const res = await request(app).post("/v2/me/addresses").set(MOBILE)
      .send({ name: "Home", city: "Dubai", country: "AE" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("addresses");
  });

  test("500 — error path", async () => {
    orderService.storeAddress.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).post("/v2/me/addresses").set(MOBILE)
      .send({ name: "Home" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("DELETE /v2/me/addresses/:id (mobile)", () => {
  test("200 — deletes address", async () => {
    orderService.deleteAddress.mockResolvedValueOnce({ addresses: [] });

    const res = await request(app).delete("/v2/me/addresses/addr1").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("addresses");
  });

  test("500 — error path", async () => {
    orderService.deleteAddress.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).delete("/v2/me/addresses/bad").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("PATCH /v2/me/addresses/:id (mobile) — partial update", () => {
  test("200 — sets primary via body { primary: true }", async () => {
    orderService.updateAddress.mockResolvedValueOnce({
      addresses: [{ isPrimary: true }],
      message: 'Address updated successfully',
    });

    const res = await request(app).patch("/v2/me/addresses/addr1").set(MOBILE)
      .send({ primary: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("addresses");
  });

  test("200 — partial field update (mobile delivery contact only)", async () => {
    orderService.updateAddress.mockResolvedValueOnce({
      addresses: [{ mobile: '8881234567' }],
      message: 'Address updated successfully',
    });

    const res = await request(app).patch("/v2/me/addresses/addr1").set(MOBILE)
      .send({ mobile: '8881234567' });

    expect(res.status).toBe(200);
    expect(orderService.updateAddress).toHaveBeenLastCalledWith(
      expect.anything(), 'addr1', { mobile: '8881234567' }
    );
  });

  test("500 — error path", async () => {
    orderService.updateAddress.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).patch("/v2/me/addresses/bad").set(MOBILE)
      .send({ primary: true });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/me/addresses (mobile) — _id rejection", () => {
  test("400 — body with _id is rejected (use PATCH to update)", async () => {
    const res = await request(app).post("/v2/me/addresses").set(MOBILE)
      .send({ _id: 'existing-id', name: 'X', mobile: '888', city: 'D', area: 'A', floorNo: '1', apartmentNo: '1', landmark: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(orderService.storeAddress).not.toHaveBeenCalled();
  });
});

describe("PATCH /orders/:id (mobile) — status-only update", () => {
  test("200 — updates order status", async () => {
    orderService.updateOrderStatus.mockResolvedValueOnce({ order: { _id: "o1", status: "delivered" } });

    const res = await request(app).patch("/v2/orders/o1").set(MOBILE)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("order");
  });

  test("500 — error path", async () => {
    orderService.updateOrderStatus.mockRejectedValueOnce({ status: 500, message: "Error" });

    const res = await request(app).patch("/v2/orders/bad").set(MOBILE)
      .send({ status: "delivered" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /orders/:id/proof-of-delivery (mobile)", () => {
  test("200 — uploads proof of delivery", async () => {
    orderService.updateOrderStatus.mockResolvedValueOnce({ order: { _id: "o1", status: "delivered" } });

    const res = await request(app).post("/v2/orders/o1/proof-of-delivery").set(MOBILE)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("order");
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

describe("POST /v2/orders/inventory-checks — error path (mobile)", () => {
  test("500 — service error propagates", async () => {
    orderService.validateInventoryBeforeCheckout.mockRejectedValueOnce({ status: 500, message: "Internal" });

    const res = await request(app).post("/v2/orders/inventory-checks").set(MOBILE)
      .send({ products: [] });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
