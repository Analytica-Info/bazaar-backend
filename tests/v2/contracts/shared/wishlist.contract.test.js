/**
 * Contract tests — shared wishlist endpoints.
 */

jest.mock("../../../../src/middleware/authV2", () => ({
  required: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
  optional: () => (req, res, next) => { req.user = { _id: "user123" }; next(); },
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
jest.mock("../../../../src/controllers/v2/mobile/notificationController", () =>
  stubAll(["getNotifications", "markRead", "trackClick"])
);
jest.mock("../../../../src/controllers/v2/shared/productController", () =>
  stubAll(["getCategories", "getProducts", "getProductDetails", "search",
    "categoriesProduct", "subCategoriesProduct", "subSubCategoriesProduct", "similarProducts"])
);

jest.mock("../../../../src/services/wishlistService", () => ({
  getWishlist: jest.fn(),
  addToWishlist: jest.fn(),
  removeFromWishlist: jest.fn(),
}));

const request = require("supertest");
const { buildApp } = require("../_helpers/app");
const wishlistService = require("../../../../src/services/wishlistService");

const WEB = { "X-Client": "web" };
const MOBILE = { "X-Client": "mobile" };

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => jest.clearAllMocks());

describe("GET /v2/wishlist", () => {
  test("200 web — returns wishlist in envelope", async () => {
    wishlistService.getWishlist.mockResolvedValueOnce({ items: ["p1", "p2"] });

    const res = await request(app).get("/v2/wishlist").set(WEB);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body)).toEqual(["success", "data"]);
    expect(res.body.data).toMatchInlineSnapshot(`
      {
        "items": [
          "p1",
          "p2",
        ],
      }
    `);
  });

  test("200 mobile — same shape", async () => {
    wishlistService.getWishlist.mockResolvedValueOnce({ items: [] });

    const res = await request(app).get("/v2/wishlist").set(MOBILE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("POST /v2/wishlist", () => {
  test("200 — adds product and returns updated wishlist", async () => {
    wishlistService.addToWishlist.mockResolvedValueOnce({ items: ["p1", "p3"] });

    const res = await request(app).post("/v2/wishlist").set(WEB)
      .send({ productId: "p3" });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toContain("p3");
  });

  test("200 — accepts both productId and product_id fields", async () => {
    wishlistService.addToWishlist.mockResolvedValueOnce({ items: ["p4"] });

    const res = await request(app).post("/v2/wishlist").set(MOBILE)
      .send({ product_id: "p4" });

    expect(res.status).toBe(200);
    expect(wishlistService.addToWishlist).toHaveBeenCalledWith("user123", "p4");
  });
});

describe("DELETE /v2/wishlist", () => {
  test("200 — removes product and returns updated wishlist", async () => {
    wishlistService.removeFromWishlist.mockResolvedValueOnce({ items: [] });

    const res = await request(app).delete("/v2/wishlist").set(WEB)
      .send({ productId: "p1" });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  test("404 — product not in wishlist", async () => {
    wishlistService.removeFromWishlist.mockRejectedValueOnce({ status: 404, message: "Not in wishlist" });

    const res = await request(app).delete("/v2/wishlist").set(WEB)
      .send({ productId: "bad" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
