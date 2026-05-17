/**
 * Contract tests — mobile auth endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
  optional: () => (req, res, next) => { req.user = null; next(); },
}));
jest.mock("../../../../src/utilities/fileUpload", () => () => ({ single: () => (req, res, next) => next() }));

const stubAll = (_names) => new Proxy({}, { get: () => (req, res) => res.json({ success: true, data: null }) });

jest.mock("../../../../src/controllers/v2/web/authController", () =>
  stubAll(["register", "login", "loginGoogle", "loginApple", "logout", "getSession",
    "passwordForgot", "passwordVerifyCode", "passwordReset", "updatePassword", "updateMe",
    "getMe", "deleteMe", "verifyRecovery", "resendRecovery"])
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

jest.mock("../../../../src/services/authService", () => ({
  register: jest.fn(),
  loginWithCredentials: jest.fn(),
  googleLogin: jest.fn(),
  appleLogin: jest.fn(),
  forgotPassword: jest.fn(),
  verifyCode: jest.fn(),
  resetPassword: jest.fn(),
  refreshToken: jest.fn(),
  checkAccessToken: jest.fn(),
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

const MOBILE = { "X-Client": "mobile" };
const FAKE_USER = { _id: "u1", name: "Test", email: "t@test.com" };
const FAKE_TOKENS = { accessToken: "at123", refreshToken: "rt456" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("POST /v2/auth/register (mobile)", () => {
  test("201 — new user returns success message, no data", async () => {
    authService.register.mockResolvedValueOnce({ restored: false });

    const res = await request(app).post("/v2/auth/register").set(MOBILE)
      .send({ name: "T", email: "t@test.com", password: "pass" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
    expect(res.body.message).toBe("User registered successfully");
  });
});

describe("POST /v2/auth/login (mobile)", () => {
  test("200 — returns tokens and user bundle (NO cookie)", async () => {
    authService.loginWithCredentials.mockResolvedValueOnce({
      tokens: FAKE_TOKENS,
      user: FAKE_USER,
      coupon: null,
      totalOrderCount: 2,
      usedFirst15Coupon: false,
    });

    const res = await request(app).post("/v2/auth/login").set(MOBILE)
      .send({ email: "t@test.com", password: "pass" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Mobile returns tokens in body — NOT cookies
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data).toHaveProperty("user");
    expect(res.body.data).toHaveProperty("coupon");
    expect(res.body.data).toHaveProperty("totalOrderCount");
    expect(res.body.data).toHaveProperty("usedFirst15Coupon");
    // Verify no set-cookie (mobile is token-based)
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("401 — bad credentials", async () => {
    authService.loginWithCredentials.mockRejectedValueOnce({ status: 401, message: "Invalid email or password" });

    const res = await request(app).post("/v2/auth/login").set(MOBILE)
      .send({ email: "x@x.com", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("POST /v2/auth/refresh (mobile)", () => {
  test("200 — returns new token pair", async () => {
    authService.refreshToken.mockResolvedValueOnce({ accessToken: "new-at", refreshToken: "new-rt" });

    const res = await request(app).post("/v2/auth/refresh").set(MOBILE)
      .set("Authorization", "Bearer old-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
  });

  test("401 — missing token returns SESSION_MISSING", async () => {
    const res = await request(app).post("/v2/auth/refresh").set(MOBILE);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_MISSING");
  });
});

describe("GET /v2/auth/session (mobile)", () => {
  test("200 — valid token returns check result", async () => {
    authService.checkAccessToken.mockResolvedValueOnce({ valid: true, userId: "u1" });

    const res = await request(app).get("/v2/auth/session").set(MOBILE)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.valid).toBe(true);
  });

  test("401 — missing token returns SESSION_MISSING", async () => {
    const res = await request(app).get("/v2/auth/session").set(MOBILE);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_MISSING");
  });
});

describe("POST /v2/auth/recovery/resend (mobile)", () => {
  test("200 — returns attemptsUsed and attemptsLeft", async () => {
    authService.resendRecoveryCode.mockResolvedValueOnce({ attemptsUsed: 2, attemptsLeft: 1 });

    const res = await request(app).post("/v2/auth/recovery/resend").set(MOBILE)
      .send({ email: "t@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "attemptsLeft": 1,
        "attemptsUsed": 2,
      }
    `);
  });
});
