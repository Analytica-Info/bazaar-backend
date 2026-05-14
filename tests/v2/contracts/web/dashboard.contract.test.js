/**
 * PR14 contract: pin the shape `/v2/user/dashboard` returns so that when
 * `bazaar-web` migrates off `/user/user-orders` (BUG-020) the new client
 * code can rely on a stable envelope.
 *
 * Today the v2 controller forwards whatever `userService.getDashboard`
 * returns. This test locks the envelope (`success`, `data`) and the
 * specific aggregate-count keys the web account dashboard consumes.
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

jest.mock("../../../../src/services/userService", () => ({
  getProfile: jest.fn(),
  getUserOrders: jest.fn(),
  getOrder: jest.fn(),
  getPaymentHistory: jest.fn(),
  getSinglePaymentHistory: jest.fn(),
  getDashboard: jest.fn(),
  getUserReviews: jest.fn(),
  getCurrentMonthOrderCategories: jest.fn(),
  storeReview: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const userService = require("../../../../src/services/userService");

const WEB = { "X-Client": "web" };
let app;

beforeAll(() => { app = buildApp(); });
afterEach(() => { jest.clearAllMocks(); });

describe("PR14 contract: GET /v2/user/dashboard shape (web)", () => {
  test("envelope: success + data fields are always present", async () => {
    userService.getDashboard.mockResolvedValueOnce({
      total_orders: 0, shipped_orders: 0, delivered_orders: 0, canceled_orders: 0,
    });

    const res = await request(app).get("/v2/user/dashboard").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("data");
  });

  test("aggregate-count keys (the four v1 client expected) pass through unchanged", async () => {
    // BUG-020: web account dashboard reads total_orders / shipped_orders /
    // delivered_orders / canceled_orders from the v1 /user/user-orders route
    // where they are not actually returned. After client migration, these
    // four keys MUST be present on the v2 dashboard response.
    userService.getDashboard.mockResolvedValueOnce({
      total_orders: 12,
      shipped_orders: 4,
      delivered_orders: 7,
      canceled_orders: 1,
    });

    const res = await request(app).get("/v2/user/dashboard").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        total_orders: 12,
        shipped_orders: 4,
        delivered_orders: 7,
        canceled_orders: 1,
      }),
    );
  });

  test("nullable counts are preserved (do not coerce to 0)", async () => {
    userService.getDashboard.mockResolvedValueOnce({
      total_orders: null,
      shipped_orders: null,
      delivered_orders: null,
      canceled_orders: null,
    });

    const res = await request(app).get("/v2/user/dashboard").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.data.total_orders).toBeNull();
    expect(res.body.data.canceled_orders).toBeNull();
  });
});
