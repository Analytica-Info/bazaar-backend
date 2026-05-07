/**
 * Contract tests — web cart endpoints.
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

const WEB = { "X-Client": "web" };

const FAKE_CART = { items: [{ product_id: "p1", qty: 2 }], total: 100 };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/cart (web)", () => {
  test("200 — returns cart wrapped in success envelope", async () => {
    cartService.getCart.mockResolvedValueOnce(FAKE_CART);

    const res = await request(app).get("/v2/cart").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body)).toEqual(["success", "data"]);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "product_id": "p1",
            "qty": 2,
          },
        ],
        "total": 100,
      }
    `);
  });

  test("500 — service error returns error envelope", async () => {
    cartService.getCart.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/cart").set(WEB);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toHaveProperty("code");
  });
});

describe("POST /v2/cart (web)", () => {
  test("200 — adds item and returns updated cart", async () => {
    const updated = { items: [{ product_id: "p1", qty: 3 }], total: 150 };
    cartService.addToCart.mockResolvedValueOnce(updated);

    const res = await request(app).post("/v2/cart").set(WEB)
      .send({ product_id: "p1", qty: 3 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(150);
  });
});

describe("DELETE /v2/cart (web)", () => {
  test("200 — removes item and returns updated cart", async () => {
    const updated = { items: [], total: 0 };
    cartService.removeFromCart.mockResolvedValueOnce(updated);

    const res = await request(app).delete("/v2/cart").set(WEB)
      .send({ product_id: "p1" });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});

describe("POST /v2/cart/increase (web)", () => {
  test("200 — returns cart after qty increase", async () => {
    cartService.increaseQty.mockResolvedValueOnce({ items: [], total: 0 });

    const res = await request(app).post("/v2/cart/increase").set(WEB)
      .send({ product_id: "p1", qty: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("POST /v2/cart/decrease (web)", () => {
  test("200 — returns cart after qty decrease", async () => {
    cartService.decreaseQty.mockResolvedValueOnce({ items: [], total: 0 });

    const res = await request(app).post("/v2/cart/decrease").set(WEB)
      .send({ product_id: "p1", qty: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
