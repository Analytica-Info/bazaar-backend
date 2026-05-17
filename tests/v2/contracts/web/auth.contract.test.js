/**
 * Contract tests — web auth endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
  optional: () => (req, res, next) => { req.user = null; next(); },
}));
jest.mock("../../../../src/utilities/fileUpload", () => () => ({ single: () => (req, res, next) => next() }));

const stubAll = (_names) => new Proxy({}, { get: () => (req, res) => res.json({ success: true, data: null }) });

jest.mock("../../../../src/controllers/v2/mobile/authController", () =>
  stubAll(["register", "login", "loginGoogle", "loginApple", "passwordForgot", "passwordVerifyCode",
    "passwordReset", "refresh", "getSession", "verifyRecovery", "resendRecovery",
    "updatePassword", "updateMe", "getMe", "deleteMe"])
);
jest.mock("../../../../src/controllers/v2/web/userController", () =>
  stubAll(["getOrders", "getOrder", "getPaymentHistory", "getSinglePaymentHistory",
    "getDashboard", "getReviews", "getCurrentMonthCategories", "addReview"])
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

// Real controller under test — mock its service dep
jest.mock("../../../../src/services/authService", () => ({
  register: jest.fn(),
  loginWithCredentials: jest.fn(),
  googleLogin: jest.fn(),
  appleLogin: jest.fn(),
  forgotPassword: jest.fn(),
  verifyCode: jest.fn(),
  resetPassword: jest.fn(),
  updatePassword: jest.fn(),
  updateProfile: jest.fn(),
  getUserData: jest.fn(),
  deleteAccount: jest.fn(),
  verifyRecoveryCode: jest.fn(),
  resendRecoveryCode: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const authService = require("../../../../src/services/authService");

const WEB = { "X-Client": "web" };
const FAKE_USER = { _id: "u1", name: "Test", email: "t@test.com", role: "user" };
const FAKE_TOKENS = { accessToken: "tok", refreshToken: "rtok" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("POST /v2/auth/register (web)", () => {
  test("201 — new registration returns success message", async () => {
    authService.register.mockResolvedValueOnce({ restored: false });

    const res = await request(app).post("/v2/auth/register").set(WEB)
      .send({ name: "Test", email: "t@test.com", phone: "555", password: "pass" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("User registered successfully");
    expect(res.body.data).toBeNull();
  });

  test("200 — restored account returns restore message", async () => {
    authService.register.mockResolvedValueOnce({ restored: true });

    const res = await request(app).post("/v2/auth/register").set(WEB)
      .send({ name: "Test", email: "t@test.com", phone: "555", password: "pass" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Account restored successfully");
  });

  test("409 — duplicate email returns envelope error", async () => {
    authService.register.mockRejectedValueOnce({ status: 409, message: "Email already exists" });

    const res = await request(app).post("/v2/auth/register").set(WEB)
      .send({ name: "T", email: "dup@test.com", password: "pass" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("POST /v2/auth/login (web)", () => {
  test("200 — sets cookie and returns user bundle", async () => {
    authService.loginWithCredentials.mockResolvedValueOnce({
      tokens: FAKE_TOKENS,
      user: FAKE_USER,
      coupon: null,
      totalOrderCount: 5,
      usedFirst15Coupon: false,
      cookieMaxAge: 86400000,
    });

    const res = await request(app).post("/v2/auth/login").set(WEB)
      .send({ email: "t@test.com", password: "pass" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body)).toEqual(["success", "data"]);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "coupon": null,
        "totalOrderCount": 5,
        "usedFirst15Coupon": false,
        "user": {
          "_id": "u1",
          "email": "t@test.com",
          "name": "Test",
          "role": "user",
        },
      }
    `);
    // Cookie should be set
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  test("401 — wrong credentials returns INVALID_CREDENTIALS", async () => {
    authService.loginWithCredentials.mockRejectedValueOnce({ status: 401, message: "Invalid email or password" });

    const res = await request(app).post("/v2/auth/login").set(WEB)
      .send({ email: "t@test.com", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /v2/auth/session (web)", () => {
  test("200 — no cookie returns authenticated: false", async () => {
    const res = await request(app).get("/v2/auth/session").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authenticated).toBe(false);
  });
});

describe("POST /v2/auth/logout (web)", () => {
  test("200 — clears cookie and returns message", async () => {
    const res = await request(app).post("/v2/auth/logout").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Logged out successfully");
    expect(res.body.data).toBeNull();
  });
});

describe("POST /v2/auth/password/forgot (web)", () => {
  test("200 — sends code", async () => {
    authService.forgotPassword.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/v2/auth/password/forgot").set(WEB)
      .send({ email: "t@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Verification code sent to email");
  });

  test("404 — user not found", async () => {
    authService.forgotPassword.mockRejectedValueOnce({ status: 404, message: "User not found" });

    const res = await request(app).post("/v2/auth/password/forgot").set(WEB)
      .send({ email: "nope@test.com" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });
});

describe("POST /v2/auth/recovery/resend (web)", () => {
  test("200 — returns attemptsUsed and attemptsLeft", async () => {
    authService.resendRecoveryCode.mockResolvedValueOnce({ attemptsUsed: 1, attemptsLeft: 2 });

    const res = await request(app).post("/v2/auth/recovery/resend").set(WEB)
      .send({ email: "t@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "attemptsLeft": 2,
        "attemptsUsed": 1,
      }
    `);
  });
});

describe("GET /v2/me (web)", () => {
  test("200 — returns user bundle", async () => {
    authService.getUserData.mockResolvedValueOnce({
      data: FAKE_USER,
      coupon: null,
      totalOrderCount: 3,
      usedFirst15Coupon: true,
    });

    const res = await request(app).get("/v2/me").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("user");
    expect(res.body.data).toHaveProperty("coupon");
    expect(res.body.data).toHaveProperty("totalOrderCount");
    expect(res.body.data).toHaveProperty("usedFirst15Coupon");
  });
});
