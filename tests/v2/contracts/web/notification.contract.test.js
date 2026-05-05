/**
 * Contract tests — web notification endpoints.
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
jest.mock("../../../../src/controllers/v2/mobile/cartController", () =>
  stubAll(["getCart", "addToCart", "removeFromCart", "increaseQty", "decreaseQty"])
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

jest.mock("../../../../src/services/notificationService", () => ({
  getUserNotifications: jest.fn(),
  markNotificationsAsRead: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const notificationService = require("../../../../src/services/notificationService");

const WEB = { "X-Client": "web" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/notifications (web)", () => {
  test("200 — returns paginated notifications with meta", async () => {
    notificationService.getUserNotifications.mockResolvedValueOnce({
      notifications: [{ _id: "n1", title: "Hello", read: false }],
      total: 1,
      page: 1,
      limit: 20,
      unreadCount: 1,
    });

    const res = await request(app).get("/v2/notifications").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Paginated envelope keys
    expect(Object.keys(res.body)).toEqual(["success", "data", "meta"]);
    // Meta shape
    expect(res.body.meta).toMatchInlineSnapshot(`
      {
        "limit": 20,
        "page": 1,
        "pages": 1,
        "total": 1,
        "unreadCount": 1,
      }
    `);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("200 — default pagination params are applied (page=1, limit=20)", async () => {
    notificationService.getUserNotifications.mockResolvedValueOnce({
      notifications: [],
      total: 0,
      page: 1,
      limit: 20,
      unreadCount: 0,
    });

    const res = await request(app).get("/v2/notifications").set(WEB);

    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
    expect(notificationService.getUserNotifications).toHaveBeenCalledWith("user123", { page: 1, limit: 20 });
  });

  test("200 — custom pagination params forwarded to service", async () => {
    notificationService.getUserNotifications.mockResolvedValueOnce({
      notifications: [],
      total: 0,
      page: 3,
      limit: 5,
      unreadCount: 0,
    });

    await request(app).get("/v2/notifications?page=3&limit=5").set(WEB);

    expect(notificationService.getUserNotifications).toHaveBeenCalledWith("user123", { page: 3, limit: 5 });
  });
});

describe("POST /v2/notifications/mark-read (web)", () => {
  test("200 — marks notifications as read", async () => {
    notificationService.markNotificationsAsRead.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/v2/notifications/mark-read").set(WEB)
      .send({ ids: ["n1", "n2"] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Notifications marked as read");
    expect(res.body.data).toBeNull();
  });

  test("400 — more than 100 ids returns BAD_REQUEST", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `n${i}`);

    const res = await request(app).post("/v2/notifications/mark-read").set(WEB)
      .send({ ids });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("200 — empty ids array is accepted", async () => {
    notificationService.markNotificationsAsRead.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/v2/notifications/mark-read").set(WEB)
      .send({ ids: [] });

    expect(res.status).toBe(200);
  });

  test("200 — non-array ids coerced to empty array", async () => {
    notificationService.markNotificationsAsRead.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/v2/notifications/mark-read").set(WEB)
      .send({ ids: "n1" });

    expect(res.status).toBe(200);
    expect(notificationService.markNotificationsAsRead).toHaveBeenCalledWith("user123", []);
  });
});
