/**
 * Contract tests — mobile notification endpoints.
 * Mobile adds trackClick vs web.
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
jest.mock("../../../../src/controllers/v2/web/notificationController", () =>
  stubAll(["getNotifications", "markRead"])
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
  trackNotificationClick: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const notificationService = require("../../../../src/services/notificationService");

const MOBILE = { "X-Client": "mobile" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/notifications (mobile)", () => {
  test("200 — paginated shape with unreadCount in meta", async () => {
    notificationService.getUserNotifications.mockResolvedValueOnce({
      notifications: [{ _id: "n1", title: "Hi", read: false }],
      total: 5,
      page: 1,
      limit: 20,
      unreadCount: 3,
    });

    const res = await request(app).get("/v2/notifications").set(MOBILE);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["success", "data", "meta"]);
    expect(res.body.meta).toMatchInlineSnapshot(`
      {
        "limit": 20,
        "page": 1,
        "pages": 1,
        "total": 5,
        "unreadCount": 3,
      }
    `);
  });
});

describe("POST /v2/notifications/mark-read (mobile)", () => {
  test("200 — marks as read", async () => {
    notificationService.markNotificationsAsRead.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/v2/notifications/mark-read").set(MOBILE)
      .send({ ids: ["n1"] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Notifications marked as read");
  });

  test("400 — >100 ids rejected", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `n${i}`);

    const res = await request(app).post("/v2/notifications/mark-read").set(MOBILE)
      .send({ ids });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});

describe("POST /v2/notifications/track-click (mobile)", () => {
  test("200 — tracks click", async () => {
    notificationService.trackNotificationClick.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/v2/notifications/track-click").set(MOBILE)
      .send({ notificationId: "n1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Click tracked");
  });

  test("web platform — track-click route does NOT exist (404)", async () => {
    // trackClick is mobile-only; web router does not mount it
    const res = await request(app).post("/v2/notifications/track-click")
      .set({ "X-Client": "web" })
      .send({ notificationId: "n1" });

    // web stub controller only has getNotifications and markRead; track-click not registered
    expect(res.status).toBe(404);
  });
});
