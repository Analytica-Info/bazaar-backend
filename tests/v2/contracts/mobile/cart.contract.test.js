/**
 * Contract tests — mobile cart endpoints (identical shape to web).
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

jest.mock("../../../../src/services/cartService", () => ({
  getCart: jest.fn(),
  addToCart: jest.fn(),
  removeFromCart: jest.fn(),
  increaseQty: jest.fn(),
  decreaseQty: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const cartService = require("../../../../src/services/cartService");

const MOBILE = { "X-Client": "mobile" };
const FAKE_CART = { items: [{ product_id: "p1", qty: 1 }], total: 50 };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/cart (mobile)", () => {
  test("200 — returns cart in success envelope", async () => {
    cartService.getCart.mockResolvedValueOnce(FAKE_CART);

    const res = await request(app).get("/v2/cart").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body)).toEqual(["success", "data"]);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "product_id": "p1",
            "qty": 1,
          },
        ],
        "total": 50,
      }
    `);
  });
});

describe("POST /v2/cart (mobile)", () => {
  test("200 — adds item", async () => {
    cartService.addToCart.mockResolvedValueOnce({ items: [{ product_id: "p2", qty: 1 }], total: 75 });

    const res = await request(app).post("/v2/cart").set(MOBILE)
      .send({ product_id: "p2", qty: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(75);
  });
});

describe("DELETE /v2/cart (mobile)", () => {
  test("200 — removes item", async () => {
    cartService.removeFromCart.mockResolvedValueOnce({ items: [], total: 0 });

    const res = await request(app).delete("/v2/cart").set(MOBILE)
      .send({ product_id: "p1" });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});

describe("GET /v2/cart — error path (mobile)", () => {
  test("500 — service throws propagates to error envelope", async () => {
    cartService.getCart.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/cart").set(MOBILE);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /v2/cart — error path (mobile)", () => {
  test("500 — service throws propagates to error envelope", async () => {
    cartService.addToCart.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).post("/v2/cart").set(MOBILE)
      .send({ product_id: "p2", qty: 1 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("DELETE /v2/cart — error path (mobile)", () => {
  test("404 — service throws 404 returns error envelope", async () => {
    cartService.removeFromCart.mockRejectedValueOnce({ status: 404, message: "Item not found" });

    const res = await request(app).delete("/v2/cart").set(MOBILE)
      .send({ product_id: "p999" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /v2/cart/increase (mobile)", () => {
  test("200 — increases item qty", async () => {
    cartService.increaseQty.mockResolvedValueOnce({ items: [{ product_id: "p1", qty: 2 }], total: 100 });

    const res = await request(app).post("/v2/cart/increase").set(MOBILE)
      .send({ product_id: "p1", qty: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(100);
  });

  test("500 — error path returns error envelope", async () => {
    cartService.increaseQty.mockRejectedValueOnce({ status: 500, message: "Internal error" });

    const res = await request(app).post("/v2/cart/increase").set(MOBILE)
      .send({ product_id: "p1", qty: 1 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /v2/cart/decrease (mobile)", () => {
  test("200 — decreases item qty", async () => {
    cartService.decreaseQty.mockResolvedValueOnce({ items: [{ product_id: "p1", qty: 1 }], total: 50 });

    const res = await request(app).post("/v2/cart/decrease").set(MOBILE)
      .send({ product_id: "p1", qty: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("500 — error path returns error envelope", async () => {
    cartService.decreaseQty.mockRejectedValueOnce({ status: 500, message: "Internal error" });

    const res = await request(app).post("/v2/cart/decrease").set(MOBILE)
      .send({ product_id: "p1", qty: 1 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
