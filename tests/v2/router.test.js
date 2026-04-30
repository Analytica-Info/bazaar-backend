/**
 * Integration tests for the v2 router contract.
 * Confirms platform dispatch and unknown-platform rejection.
 * Uses live express app on a random port (axios is available; supertest is not).
 */
const express = require("express");
const cookieParser = require("cookie-parser");
const axios = require("axios");

// Stub auth controllers — avoid pulling in DB-bound services.
jest.mock("../../src/controllers/v2/mobile/authController", () => ({
  login: (req, res) => res.json({ success: true, data: { from: "mobile-login" } }),
  register: (req, res) => res.json({ success: true, data: {} }),
  googleLogin: (req, res) => res.json({ success: true, data: {} }),
  appleLogin: (req, res) => res.json({ success: true, data: {} }),
  forgotPassword: (req, res) => res.json({ success: true, data: null }),
  verifyCode: (req, res) => res.json({ success: true, data: null }),
  resetPassword: (req, res) => res.json({ success: true, data: null }),
  refreshToken: (req, res) => res.json({ success: true, data: null }),
  checkAccessToken: (req, res) => res.json({ success: true, data: null }),
  verifyRecoveryCode: (req, res) => res.json({ success: true, data: null }),
  resendRecoveryCode: (req, res) => res.json({ success: true, data: null }),
  updatePassword: (req, res) => res.json({ success: true, data: null }),
  updateProfile: (req, res) => res.json({ success: true, data: null }),
  getUserData: (req, res) => res.json({ success: true, data: null }),
  deleteAccount: (req, res) => res.json({ success: true, data: null }),
}));

jest.mock("../../src/controllers/v2/web/authController", () => ({
  login: (req, res) => res.json({ success: true, data: { from: "web-login" } }),
  register: (req, res) => res.json({ success: true, data: {} }),
  googleLogin: (req, res) => res.json({ success: true, data: {} }),
  appleLogin: (req, res) => res.json({ success: true, data: {} }),
  logout: (req, res) => res.json({ success: true, data: null }),
  checkAuth: (req, res) => res.json({ success: true, data: { authenticated: false } }),
  forgotPassword: (req, res) => res.json({ success: true, data: null }),
  verifyCode: (req, res) => res.json({ success: true, data: null }),
  resetPassword: (req, res) => res.json({ success: true, data: null }),
  updatePassword: (req, res) => res.json({ success: true, data: null }),
  updateProfile: (req, res) => res.json({ success: true, data: null }),
  getUserData: (req, res) => res.json({ success: true, data: null }),
  deleteAccount: (req, res) => res.json({ success: true, data: null }),
  verifyRecoveryCode: (req, res) => res.json({ success: true, data: null }),
  resendRecoveryCode: (req, res) => res.json({ success: true, data: null }),
}));

jest.mock("../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => next(),
  optional: () => (req, res, next) => next(),
}));

const stubAll = (names) =>
  Object.fromEntries(names.map((n) => [n, (req, res) => res.json({ success: true, data: null })]));

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
  stubAll(["getAddress", "storeAddress", "deleteAddress", "setPrimaryAddress", "validateInventory"])
);
jest.mock("../../src/controllers/v2/mobile/cartController", () =>
  stubAll(["getCart", "addToCart", "removeFromCart", "increaseQty", "decreaseQty"])
);
jest.mock("../../src/controllers/v2/web/cartController", () =>
  stubAll(["getCart", "addToCart", "removeFromCart", "increaseQty", "decreaseQty"])
);
jest.mock("../../src/controllers/v2/mobile/notificationController", () =>
  stubAll(["getNotifications", "markRead", "trackClick"])
);
jest.mock("../../src/controllers/v2/web/notificationController", () =>
  stubAll(["getNotifications", "markRead"])
);
jest.mock("../../src/controllers/v2/shared/productController", () =>
  stubAll(["getCategories", "getProducts", "getProductDetails", "search", "categoriesProduct", "subCategoriesProduct", "subSubCategoriesProduct", "similarProducts"])
);
jest.mock("../../src/controllers/v2/shared/wishlistController", () =>
  stubAll(["getWishlist", "addToWishlist", "removeFromWishlist", "toggleWishlist"])
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

  test("unknown platform returns 400 with envelope error", async () => {
    const res = await post("/v2/auth/login");
    expect(res.status).toBe(400);
    expect(res.data).toEqual({
      success: false,
      error: { code: "UNKNOWN_PLATFORM", message: "X-Client header required. Valid values: web, mobile" },
    });
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
