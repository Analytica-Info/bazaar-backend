/**
 * Contract tests — web order endpoints.
 * Mocks all services; no Mongo required.
 */

// ── Stub all controllers and middleware ──────────────────────────────────────

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => {
    req.user = { _id: "user123", fcmToken: null };
    next();
  },
  optional: () => (req, res, next) => {
    req.user = { _id: "user123" };
    next();
  },
}));

jest.mock("../../../../src/utilities/fileUpload", () => () => ({
  single: () => (req, res, next) => next(),
}));

// Stub controllers that are not under test (required by the v2 router)
const stubAll = (names) =>
  Object.fromEntries(names.map((n) => [n, (req, res) => res.json({ success: true, data: null })]));

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
jest.mock("../../../../src/controllers/v2/mobile/orderController", () =>
  stubAll(["getOrders", "validateInventory", "checkoutStripe", "checkoutTabby", "verifyTabby",
    "checkoutNomod", "verifyNomod", "initStripePayment", "getPaymentMethods",
    "getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "updateOrderStatus"])
);
jest.mock("../../../../src/controllers/v2/shared/productController", () =>
  stubAll(["getCategories", "getProducts", "getProductDetails", "search",
    "categoriesProduct", "subCategoriesProduct", "subSubCategoriesProduct", "similarProducts"])
);
jest.mock("../../../../src/controllers/v2/shared/wishlistController", () =>
  stubAll(["getWishlist", "addToWishlist", "removeFromWishlist", "toggleWishlist"])
);

// ── Mock the service used by the real web/orderController ────────────────────
jest.mock("../../../../src/services/orderService", () => ({
  getAddresses: jest.fn(),
  storeAddress: jest.fn(),
  deleteAddress: jest.fn(),
  setPrimaryAddress: jest.fn(),
  validateInventoryBeforeCheckout: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const { normalize } = require("../_helpers/normalize");
const orderService = require("../../../../src/services/orderService");

const WEB = { "X-Client": "web" };

let app;
beforeAll(() => {
  app = buildApp();
});

afterEach(() => jest.clearAllMocks());

// ── GET /v2/orders/address ────────────────────────────────────────────────────
describe("GET /v2/orders/address", () => {
  test("200 — returns address and flag", async () => {
    orderService.getAddresses.mockResolvedValueOnce({
      address: [{ name: "Home", city: "Dubai" }],
      flag: "AE",
    });

    const res = await request(app).get("/v2/orders/address").set(WEB);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["success", "data"]);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "address": [
          {
            "city": "Dubai",
            "name": "Home",
          },
        ],
        "flag": "AE",
      }
    `);
  });

  test("500 — service error returns envelope error shape", async () => {
    orderService.getAddresses.mockRejectedValueOnce({ status: 500, message: "DB error" });

    const res = await request(app).get("/v2/orders/address").set(WEB);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });
});

// ── POST /v2/orders/address ───────────────────────────────────────────────────
describe("POST /v2/orders/address", () => {
  test("200 — stores address and returns addresses + message", async () => {
    orderService.storeAddress.mockResolvedValueOnce({
      addresses: [{ name: "Work", city: "Abu Dhabi" }],
      message: "Address saved",
    });

    const res = await request(app)
      .post("/v2/orders/address")
      .set(WEB)
      .send({ name: "Work", city: "Abu Dhabi" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Address saved");
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "addresses": [
          {
            "city": "Abu Dhabi",
            "name": "Work",
          },
        ],
      }
    `);
  });
});

// ── DELETE /v2/orders/address/:addressId ─────────────────────────────────────
describe("DELETE /v2/orders/address/:addressId", () => {
  test("200 — deletes address and returns updated list", async () => {
    orderService.deleteAddress.mockResolvedValueOnce({ addresses: [] });

    const res = await request(app)
      .delete("/v2/orders/address/addr1")
      .set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Address deleted successfully");
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "addresses": [],
      }
    `);
  });

  test("404 — address not found", async () => {
    orderService.deleteAddress.mockRejectedValueOnce({ status: 404, message: "Address not found" });

    const res = await request(app)
      .delete("/v2/orders/address/bad-id")
      .set(WEB);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

// ── PATCH /v2/orders/address/:addressId/set-primary ──────────────────────────
describe("PATCH /v2/orders/address/:addressId/set-primary", () => {
  test("200 — sets primary address", async () => {
    orderService.setPrimaryAddress.mockResolvedValueOnce({
      addresses: [{ name: "Home", city: "Dubai" }],
    });

    const res = await request(app)
      .patch("/v2/orders/address/addr1/set-primary")
      .set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Primary address set successfully");
    expect(res.body.data.addresses).toHaveLength(1);
  });
});

// ── POST /v2/orders/validate-inventory ───────────────────────────────────────
describe("POST /v2/orders/validate-inventory", () => {
  test("200 — valid inventory returns isValid true", async () => {
    orderService.validateInventoryBeforeCheckout.mockResolvedValueOnce({
      isValid: true,
      results: [{ productId: "p1", available: true }],
      message: "Inventory is valid",
    });

    const res = await request(app)
      .post("/v2/orders/validate-inventory")
      .set(WEB)
      .send({ products: [{ productId: "p1", qty: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isValid).toBe(true);
    expect(Array.isArray(res.body.data.results)).toBe(true);
    expect(res.body.message).toBe("Inventory is valid");
  });

  test("200 — invalid inventory returns isValid false", async () => {
    orderService.validateInventoryBeforeCheckout.mockResolvedValueOnce({
      isValid: false,
      results: [{ productId: "p1", available: false }],
      message: "Some items are out of stock",
    });

    const res = await request(app)
      .post("/v2/orders/validate-inventory")
      .set(WEB)
      .send({ products: [] });

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(false);
  });
});
