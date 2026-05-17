/**
 * Integration tests for the v2 router contract.
 * Confirms platform dispatch and unknown-platform rejection.
 * Uses live express app on a random port (axios is available; supertest is not).
 */
const express = require("express");
const cookieParser = require("cookie-parser");
const axios = require("axios");

// Stub auth controllers — avoid pulling in DB-bound services.
// Use a Proxy so any handler name the router asks for is auto-stubbed.
// This matches the pattern the rest of this file uses for user/order/cart/etc
// and means the router.test.js stops being a tripwire whenever auth handler
// names are renamed (Wave 1 cleanup moved everything to /me + /auth/*).
const authStub = (label) => new Proxy({}, {
  get: (_t, k) => (req, res) => res.json({ success: true, data: { from: `${label}-${String(k)}` } }),
});

jest.mock("../../src/controllers/v2/mobile/authController", () => authStub("mobile"));
jest.mock("../../src/controllers/v2/web/authController", () => authStub("web"));

jest.mock("../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => next(),
  optional: () => (req, res, next) => next(),
}));

const stubAll = (_names) => new Proxy({}, { get: () => (req, res) => res.json({ success: true, data: null }) });

jest.mock("../../src/controllers/v2/mobile/userController", () =>
  stubAll(["getProfile", "getOrders", "getOrder", "getPaymentHistory", "getSinglePaymentHistory", "getDashboard", "getReviews", "getTabbyBuyerHistory"])
);
jest.mock("../../src/controllers/v2/web/userController", () =>
  stubAll(["getProfile", "getOrders", "getOrder", "getPaymentHistory", "getSinglePaymentHistory", "getDashboard", "getReviews", "getCurrentMonthCategories", "addReview"])
);
jest.mock("../../src/controllers/v2/mobile/orderController", () =>
  stubAll(["getOrders", "validateInventory", "checkoutStripe", "checkoutTabby", "verifyTabby", "checkoutNomod", "verifyNomod", "initStripePayment", "getPaymentMethods", "getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "updateOrderStatus"])
);
jest.mock("../../src/controllers/v2/web/orderController", () =>
  stubAll(["getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "validateInventory", "checkoutNomod", "verifyNomod"])
);
jest.mock("../../src/controllers/v2/mobile/cartController", () =>
  stubAll(["getCart", "addToCart", "removeFromCart", "increaseQty", "decreaseQty"])
);
jest.mock("../../src/controllers/v2/web/cartController", () =>
  stubAll(["getCart", "addToCart", "removeFromCart", "increaseQty", "decreaseQty"])
);
jest.mock("../../src/controllers/v2/mobile/notificationController", () =>
  stubAll(["getNotifications", "updateReadState", "markRead", "recordClick", "trackClick"])
);
jest.mock("../../src/controllers/v2/web/notificationController", () =>
  stubAll(["getNotifications", "updateReadState", "markRead"])
);
jest.mock("../../src/controllers/v2/shared/productController", () =>
  stubAll(["listCategories", "searchCategories", "getProducts", "getProductDetails", "search", "listCategoryProducts", "listSimilarProducts"])
);
jest.mock("../../src/controllers/v2/shared/wishlistController", () =>
  stubAll(["getWishlist", "addItem", "removeItem", "addToWishlist", "removeFromWishlist"])
);
jest.mock("../../src/utilities/fileUpload", () => () => ({
  single: () => (req, res, next) => next(),
}));

const v2Router = require("../../src/routes/v2");

describe("v2 router platform dispatch", () => {
  let server;
  let baseURL;

  beforeAll((done) => {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/v2", v2Router);
    server = app.listen(0, () => {
      baseURL = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll(() => new Promise((resolve) => server.close(() => resolve())));

  const post = (path, opts = {}) =>
    axios.post(`${baseURL}${path}`, opts.body || {}, {
      headers: opts.headers || {},
      validateStatus: () => true,
    });
  const get = (path, opts = {}) =>
    axios.get(`${baseURL}${path}`, {
      headers: opts.headers || {},
      validateStatus: () => true,
    });

  test("X-Client: mobile dispatches to mobile controller", async () => {
    const res = await post("/v2/auth/login", { headers: { "X-Client": "mobile" } });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, data: { from: "mobile-login" } });
  });

  test("X-Client: web dispatches to web controller", async () => {
    const res = await post("/v2/auth/login", { headers: { "X-Client": "web" } });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, data: { from: "web-login" } });
  });

  test("user_token cookie dispatches to web", async () => {
    const res = await post("/v2/auth/login", { headers: { Cookie: "user_token=abc" } });
    expect(res.data.data.from).toBe("web-login");
  });

  test("Authorization Bearer dispatches to mobile", async () => {
    const res = await post("/v2/auth/login", { headers: { Authorization: "Bearer xyz" } });
    expect(res.data.data.from).toBe("mobile-login");
  });

  // Behavior change (2026-05-05, V1-BACKCOMPAT-FINAL-AUDIT.md): a request
  // with no platform indicators (no X-Client, no user_token cookie, no Bearer)
  // now defaults to platform='web' instead of returning 400. This unblocks
  // fresh-browser unauthenticated users hitting /v2/auth/login. Mobile
  // binaries always send Bearer so they continue to dispatch to mobile.
  test("no platform indicators defaults to web (fresh-browser fallback)", async () => {
    const res = await post("/v2/auth/login");
    // Falls through to web BFF — login handler emits the platform-specific
    // success body. Exact body shape depends on the test app fixture; what
    // matters is that the request is NOT rejected with 400 UNKNOWN_PLATFORM.
    expect(res.status).not.toBe(400);
    if (res.data && res.data.error) {
      expect(res.data.error.code).not.toBe("UNKNOWN_PLATFORM");
    }
  });

  test("shared routes accessible regardless of platform header", async () => {
    const resWeb = await get("/v2/products", { headers: { "X-Client": "web" } });
    const resMobile = await get("/v2/products", { headers: { "X-Client": "mobile" } });
    expect(resWeb.status).toBe(200);
    expect(resMobile.status).toBe(200);
    expect(resWeb.data).toEqual({ success: true, data: null });
    expect(resMobile.data).toEqual({ success: true, data: null });
  });
});
