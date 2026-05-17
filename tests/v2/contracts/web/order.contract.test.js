'use strict';
/**
 * Contract tests — web order + address endpoints (Wave 2 URLs).
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
jest.mock("../../../../src/controllers/v2/mobile/orderController", () =>
  stubAll(["getOrders", "createInventoryCheck", "createStripeCheckout", "createTabbyCheckout",
    "verifyTabbyCheckout", "createNomodCheckout", "verifyNomodCheckout", "initStripeCheckout",
    "listPaymentMethods", "listAddresses", "createAddress", "deleteAddress", "updateAddress",
    "uploadProofOfDelivery", "updateOrderStatus"])
);
jest.mock("../../../../src/controllers/v2/shared/productController", () =>
  stubAll(["listCategories", "searchCategories", "getProducts", "getProductDetails", "search",
    "listCategoryProducts", "listSimilarProducts"])
);
jest.mock("../../../../src/controllers/v2/shared/wishlistController", () =>
  stubAll(["getWishlist", "addItem", "removeItem", "addToWishlist", "removeFromWishlist"])
);

// ── Mock the service used by the real web/orderController ────────────────────
jest.mock("../../../../src/services/orderService", () => ({
  getAddresses: jest.fn(),
  storeAddress: jest.fn(),
  deleteAddress: jest.fn(),
  updateAddress: jest.fn(),
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

// ── GET /v2/me/addresses ──────────────────────────────────────────────────────
describe("GET /v2/me/addresses", () => {
  test("200 — returns address and flag", async () => {
    orderService.getAddresses.mockResolvedValueOnce({
      address: [{ name: "Home", city: "Dubai" }],
      flag: "AE",
    });

    const res = await request(app).get("/v2/me/addresses").set(WEB);

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

    const res = await request(app).get("/v2/me/addresses").set(WEB);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });
});

// ── POST /v2/me/addresses ─────────────────────────────────────────────────────
describe("POST /v2/me/addresses", () => {
  test("200 — stores address and returns addresses + message", async () => {
    orderService.storeAddress.mockResolvedValueOnce({
      addresses: [{ name: "Work", city: "Abu Dhabi" }],
      message: "Address saved",
    });

    const res = await request(app)
      .post("/v2/me/addresses")
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

// ── DELETE /v2/me/addresses/:id ───────────────────────────────────────────────
describe("DELETE /v2/me/addresses/:id", () => {
  test("200 — deletes address and returns updated list", async () => {
    orderService.deleteAddress.mockResolvedValueOnce({ addresses: [] });

    const res = await request(app)
      .delete("/v2/me/addresses/addr1")
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
      .delete("/v2/me/addresses/bad-id")
      .set(WEB);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

// ── PATCH /v2/me/addresses/:id — partial update ──────────────────────────────
describe("PATCH /v2/me/addresses/:id", () => {
  test("200 — sets primary via body { primary: true }", async () => {
    orderService.updateAddress.mockResolvedValueOnce({
      addresses: [{ name: "Home", city: "Dubai" }],
      message: 'Address updated successfully',
    });

    const res = await request(app)
      .patch("/v2/me/addresses/addr1")
      .set(WEB)
      .send({ primary: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Address updated successfully");
    expect(res.body.data.addresses).toHaveLength(1);
  });

  test("200 — partial field update (city only)", async () => {
    orderService.updateAddress.mockResolvedValueOnce({
      addresses: [{ city: "Abu Dhabi" }],
      message: 'Address updated successfully',
    });

    const res = await request(app)
      .patch("/v2/me/addresses/addr1")
      .set(WEB)
      .send({ city: "Abu Dhabi" });

    expect(res.status).toBe(200);
    expect(orderService.updateAddress).toHaveBeenLastCalledWith(
      expect.anything(), "addr1", { city: "Abu Dhabi" }
    );
  });
});

// ── POST /v2/me/addresses — _id rejection ────────────────────────────────────
describe("POST /v2/me/addresses (web) — _id rejection", () => {
  test("400 — body with _id is rejected (use PATCH to update)", async () => {
    const res = await request(app)
      .post("/v2/me/addresses").set(WEB)
      .send({ _id: 'existing-id', name: 'X', mobile: '888', city: 'D', area: 'A', floorNo: '1', apartmentNo: '1', landmark: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(orderService.storeAddress).not.toHaveBeenCalled();
  });
});

// ── POST /v2/orders/inventory-checks ─────────────────────────────────────────
describe("POST /v2/orders/inventory-checks", () => {
  test("200 — valid inventory returns isValid true", async () => {
    orderService.validateInventoryBeforeCheckout.mockResolvedValueOnce({
      isValid: true,
      results: [{ productId: "p1", available: true }],
      message: "Inventory is valid",
    });

    const res = await request(app)
      .post("/v2/orders/inventory-checks")
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
      .post("/v2/orders/inventory-checks")
      .set(WEB)
      .send({ products: [] });

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(false);
  });
});
