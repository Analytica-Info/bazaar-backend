// Mock all heavy dependencies at module boundary before require
jest.mock("../../../src/services/checkoutService", () => ({
  createStripeCheckout: jest.fn(), createTabbyCheckout: jest.fn(),
  verifyStripePayment: jest.fn(), verifyTabbyPayment: jest.fn(),
  processCheckout: jest.fn(), handleTabbyWebhook: jest.fn(),
  createNomodCheckout: jest.fn(), verifyNomodPayment: jest.fn(),
}));
jest.mock("../../../src/services/couponService", () => ({
  getCoupons: jest.fn(), getCouponCount: jest.fn(), updateCouponCount: jest.fn(),
  checkCouponCode: jest.fn(), redeemCoupon: jest.fn(), createCoupon: jest.fn(),
}));
jest.mock("../../../src/services/cmsService", () => ({
  invalidateCmsCache: jest.fn(), getCmsData: jest.fn(), updateCouponCms: jest.fn(),
  getCouponCms: jest.fn(), updateHeader: jest.fn(), updateSlider: jest.fn(),
  updateFeatures: jest.fn(), updateOffers: jest.fn(), updateCategoryImages: jest.fn(),
  updateOfferFilter: jest.fn(), updateFooter: jest.fn(), updateAbout: jest.fn(),
  updateShop: jest.fn(), updateContact: jest.fn(), updateBrandsLogo: jest.fn(),
  uploadEditorImage: jest.fn(), deleteEditorImage: jest.fn(),
}));
jest.mock("../../../src/services/newsletterService", () => ({
  subscribe: jest.fn(), unsubscribe: jest.fn(), getSubscribers: jest.fn(),
  sendBulkEmails: jest.fn(),
}));
jest.mock("axios");
jest.mock("../../../src/services/productService", () => ({
  getProducts: jest.fn(), getProductById: jest.fn(), searchProducts: jest.fn(),
  getCategories: jest.fn(), getBrands: jest.fn(), getAllProducts: jest.fn(),
  getAllCategories: jest.fn(), getHomeProducts: jest.fn(), getProductDetails: jest.fn(),
  getSimilarProducts: jest.fn(), getRandomProducts: jest.fn(), getBrandNameById: jest.fn(),
  getCategoryNameById: jest.fn(), fetchDbProducts: jest.fn(), fetchProductsNoImages: jest.fn(),
  getCategoriesProduct: jest.fn(), getSubCategoriesProduct: jest.fn(),
  getSubSubCategoriesProduct: jest.fn(), searchSingleProduct: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../../src/utilities/activityLogger", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/utilities/backendLogger", () => ({ logBackendActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("stripe", () => () => ({
  paymentIntents: { create: jest.fn() },
  checkout: { sessions: { retrieve: jest.fn() } },
}));
jest.mock("../../../src/config/db", () => jest.fn().mockResolvedValue(undefined));
jest.mock("../../../src/utilities/emailHelper", () => ({
  getAdminEmail: jest.fn().mockResolvedValue("admin@test.com"),
  getCcEmails: jest.fn().mockResolvedValue([]),
}));
jest.mock("compression", () => jest.fn(() => (req, res, next) => next()));
jest.mock("cors", () => jest.fn(() => (req, res, next) => next()));
jest.mock("../../../src/utilities/stringUtils", () => ({ escapeRegex: jest.fn(s => s) }));
jest.mock("typo-js", () => jest.fn().mockImplementation(() => ({ suggest: jest.fn().mockReturnValue([]) })));
jest.mock("pako", () => ({ inflate: jest.fn(), deflate: jest.fn() }));
jest.mock("csv-writer", () => ({
  createObjectCsvWriter: jest.fn().mockReturnValue({ writeRecords: jest.fn() }),
  createObjectCsvStringifier: jest.fn().mockReturnValue({ getHeaderString: jest.fn().mockReturnValue(""), stringifyRecords: jest.fn().mockReturnValue("") }),
}));
jest.mock("fast-csv", () => ({ parse: jest.fn(), write: jest.fn() }));
jest.mock("multer", () => {
  const m = jest.fn().mockReturnValue({ fields: jest.fn().mockReturnValue((req, res, next) => next()), single: jest.fn().mockReturnValue((req, res, next) => next()), array: jest.fn().mockReturnValue((req, res, next) => next()) });
  m.MulterError = class MulterError extends Error {};
  return m;
});
jest.mock("nodemailer", () => ({ createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn() }) }));
jest.mock("async", () => ({ parallel: jest.fn() }));
jest.mock("../../../src/config/multerConfig", () => jest.fn().mockReturnValue({
  fields: jest.fn().mockReturnValue((req, res, next) => next()),
  single: jest.fn().mockReturnValue((req, res, next) => next()),
  array: jest.fn().mockReturnValue((req, res, next) => next()),
}));
jest.mock("../../../src/utils/deleteOldFile", () => jest.fn());
jest.mock("../../../src/utilities/activityLogger", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/mail/emailService", () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
// Shared model objects so tests can mutate mocks on the same reference the controller holds
const mockRepoModels = {
  orders: { create: jest.fn() },
  orderDetails: { insertMany: jest.fn() },
  reviews: {
    create: jest.fn(),
    find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]), populate: jest.fn().mockResolvedValue([]) }) }),
  },
  coupons: { find: jest.fn().mockResolvedValue([]) },
  bankPromoCodes: { find: jest.fn().mockResolvedValue([]) },
  bankPromoCodeUsages: { find: jest.fn().mockResolvedValue([]) },
  notifications: { create: jest.fn() },
  carts: { findOne: jest.fn().mockResolvedValue(null) },
  newsletters: { findOne: jest.fn().mockResolvedValue(null) },
  products: { findById: jest.fn().mockResolvedValue(null), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }), findOne: jest.fn().mockResolvedValue(null), findByIdAndUpdate: jest.fn().mockResolvedValue(null), updateOne: jest.fn().mockResolvedValue(null) },
  productIds: { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]), create: jest.fn() },
  productViews: { findOne: jest.fn().mockResolvedValue(null) },
  users: { findById: jest.fn().mockResolvedValue(null) },
  cronJoblogs: { find: jest.fn().mockResolvedValue([]) },
  couponsCount: { findOne: jest.fn().mockResolvedValue(null) },
  brands: { find: jest.fn().mockResolvedValue([]) },
  categories: { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) },
};
jest.mock("../../../src/repositories", () => ({
  orders: { rawModel: () => mockRepoModels.orders },
  orderDetails: { rawModel: () => mockRepoModels.orderDetails },
  reviews: { rawModel: () => mockRepoModels.reviews },
  coupons: { rawModel: () => mockRepoModels.coupons },
  bankPromoCodes: { rawModel: () => mockRepoModels.bankPromoCodes },
  bankPromoCodeUsages: { rawModel: () => mockRepoModels.bankPromoCodeUsages },
  notifications: { rawModel: () => mockRepoModels.notifications },
  carts: { rawModel: () => mockRepoModels.carts },
  newsletters: { rawModel: () => mockRepoModels.newsletters },
  products: { rawModel: () => mockRepoModels.products },
  productIds: { rawModel: () => mockRepoModels.productIds },
  productViews: { rawModel: () => mockRepoModels.productViews },
  users: { rawModel: () => mockRepoModels.users },
  cronJoblogs: { rawModel: () => mockRepoModels.cronJoblogs },
  couponsCount: { rawModel: () => mockRepoModels.couponsCount },
  brands: { rawModel: () => mockRepoModels.brands },
  categories: { rawModel: () => mockRepoModels.categories },
  cartData: { rawModel: () => ({ findOne: jest.fn().mockResolvedValue(null) }) },
  pendingPayments: { rawModel: () => ({ findOne: jest.fn().mockResolvedValue(null) }) },
  flashSales: { rawModel: () => ({ findOne: jest.fn() }) },
}));

const checkoutService = require("../../../src/services/checkoutService");
const couponService = require("../../../src/services/couponService");
const cmsService = require("../../../src/services/cmsService");
const newsletterService = require("../../../src/services/newsletterService");
const productService = require("../../../src/services/productService");
const axios = require("axios");

const ctrl = require("../../../src/controllers/ecommerce/publicController");

const makeReq = (opts = {}) => ({
  user: opts.user || { _id: "u1", email: "u@t.com" },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  headers: opts.headers || {},
  files: opts.files || {},
  file: opts.file || null,
  socket: { remoteAddress: "127.0.0.1" },
  header: jest.fn((h) => (opts.headers || {})[h]),
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn().mockReturnValue(r);
  r.write = jest.fn().mockReturnValue(r);
  r.end = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── checkout (processCheckout fix verification) ───────────────────
describe("checkout", () => {
  it("200 on success — processCheckout fix happy path", async () => {
    checkoutService.processCheckout.mockResolvedValue({ message: "Order created successfully", orderId: "o1" });
    const req = makeReq({ body: { name: "A", email: "a@b.com", address: "addr", cartData: [{ price: 50, qty: 2, id: "p1", name: "P1" }], shippingCost: 10, currency: "usd" } });
    const res = makeRes();
    await ctrl.checkout(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Order created successfully" }));
  });
  it("500 on service error", async () => {
    checkoutService.processCheckout.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkout(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── createCardCheckout ────────────────────────────────────────────
describe("createCardCheckout", () => {
  it("200 on success", async () => {
    checkoutService.createStripeCheckout.mockResolvedValue({ sessionId: "sess_1" });
    const req = makeReq({ body: { cartData: [] } });
    const res = makeRes();
    await ctrl.createCardCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sessionId: "sess_1" });
  });
  it("500 on error", async () => {
    checkoutService.createStripeCheckout.mockRejectedValue(new Error("stripe down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createCardCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── createTabbyCheckout ───────────────────────────────────────────
describe("createTabbyCheckout", () => {
  it("200 on success", async () => {
    checkoutService.createTabbyCheckout.mockResolvedValue({ paymentUrl: "https://tabby.ai/pay" });
    const req = makeReq({ body: { cartData: [] } });
    const res = makeRes();
    await ctrl.createTabbyCheckout(req, res);
    expect(res.json).toHaveBeenCalledWith({ paymentUrl: "https://tabby.ai/pay" });
  });
  it("passes status error", async () => {
    checkoutService.createTabbyCheckout.mockRejectedValue({ status: 400, message: "invalid cart" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createTabbyCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    checkoutService.createTabbyCheckout.mockRejectedValue(new Error("tabby down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createTabbyCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── verifyCardPayment ─────────────────────────────────────────────
describe("verifyCardPayment", () => {
  it("200 on success", async () => {
    checkoutService.verifyStripePayment.mockResolvedValue({ success: true });
    const req = makeReq({ body: { sessionId: "sess_1" } });
    const res = makeRes();
    await ctrl.verifyCardPayment(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
  it("passes status error", async () => {
    checkoutService.verifyStripePayment.mockRejectedValue({ status: 404, message: "session not found" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.verifyCardPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    checkoutService.verifyStripePayment.mockRejectedValue(new Error("stripe down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.verifyCardPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── verifyTabbyPayment ────────────────────────────────────────────
describe("verifyTabbyPayment", () => {
  it("200 on success", async () => {
    checkoutService.verifyTabbyPayment.mockResolvedValue({ success: true });
    const req = makeReq({ body: { paymentId: "pay_1", bankPromoId: null } });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
  it("passes status error", async () => {
    checkoutService.verifyTabbyPayment.mockRejectedValue({ status: 400, message: "bad payment" });
    const req = makeReq({ body: { paymentId: "bad" } });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    checkoutService.verifyTabbyPayment.mockRejectedValue(new Error("tabby down"));
    const req = makeReq({ body: { paymentId: "pay_1" } });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── createNomodCheckout ───────────────────────────────────────────
describe("createNomodCheckout", () => {
  it("200 on success", async () => {
    checkoutService.createNomodCheckout.mockResolvedValue({ paymentUrl: "https://nomod.com/pay" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createNomodCheckout(req, res);
    expect(res.json).toHaveBeenCalledWith({ paymentUrl: "https://nomod.com/pay" });
  });
  it("passes status error", async () => {
    checkoutService.createNomodCheckout.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createNomodCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    checkoutService.createNomodCheckout.mockRejectedValue(new Error("nomod down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createNomodCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── verifyNomodPayment ────────────────────────────────────────────
describe("verifyNomodPayment", () => {
  it("200 on success", async () => {
    checkoutService.verifyNomodPayment.mockResolvedValue({ success: true });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.verifyNomodPayment(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
  it("passes status error", async () => {
    checkoutService.verifyNomodPayment.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.verifyNomodPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── tabbyWebhook ──────────────────────────────────────────────────
describe("tabbyWebhook", () => {
  it("200 with string result", async () => {
    checkoutService.handleTabbyWebhook.mockResolvedValue("ok");
    const req = makeReq({ body: { payment: { id: "p1" } }, headers: { "x-webhook-secret": "secret" } });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("ok");
  });
  it("200 with json result", async () => {
    checkoutService.handleTabbyWebhook.mockResolvedValue({ message: "processed" });
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "processed" });
  });
  it("passes status error", async () => {
    checkoutService.handleTabbyWebhook.mockRejectedValue({ status: 403, message: "Forbidden" });
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it("500 on unknown error", async () => {
    checkoutService.handleTabbyWebhook.mockRejectedValue(new Error("boom"));
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.tabbyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── coupon service wrappers ───────────────────────────────────────
describe("getCouponCount", () => {
  it("200 on success", async () => {
    couponService.getCouponCount.mockResolvedValue({ count: 5 });
    const res = makeRes();
    await ctrl.getCouponCount(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    couponService.getCouponCount.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getCouponCount(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("updateCouponCount", () => {
  it("200 on success", async () => {
    couponService.updateCouponCount.mockResolvedValue({ count: 10 });
    const res = makeRes();
    await ctrl.updateCouponCount(makeReq({ body: { count: 10 } }), res);
    expect(res.json).toHaveBeenCalledWith({ count: 10 });
  });
});

describe("coupons", () => {
  it("200 on success", async () => {
    couponService.getCoupons.mockResolvedValue([]);
    const res = makeRes();
    await ctrl.coupons(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("checkCouponCode", () => {
  it("200 on valid coupon", async () => {
    couponService.checkCouponCode.mockResolvedValue({ valid: true });
    const res = makeRes();
    await ctrl.checkCouponCode(makeReq({ body: { couponCode: "SAVE10" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    couponService.checkCouponCode.mockRejectedValue({ status: 400, message: "invalid" });
    const res = makeRes();
    await ctrl.checkCouponCode(makeReq({ body: { couponCode: "BAD" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("redeemCoupon", () => {
  it("200 on success", async () => {
    couponService.redeemCoupon.mockResolvedValue({ success: true });
    const res = makeRes();
    await ctrl.redeemCoupon(makeReq({ body: { couponCode: "SAVE10", mobileNumber: "123" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("createCoupon", () => {
  it("201 on success", async () => {
    couponService.createCoupon.mockResolvedValue({ _id: "c1" });
    const res = makeRes();
    await ctrl.createCoupon(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("passes status error", async () => {
    couponService.createCoupon.mockRejectedValue({ status: 409, message: "exists" });
    const res = makeRes();
    await ctrl.createCoupon(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

// ── newsletter ────────────────────────────────────────────────────
describe("newsLetter", () => {
  it("201 on success", async () => {
    newsletterService.subscribe.mockResolvedValue({ message: "subscribed" });
    const res = makeRes();
    await ctrl.newsLetter(makeReq({ body: { email: "a@b.com", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("passes status error", async () => {
    newsletterService.subscribe.mockRejectedValue({ status: 400, message: "already subscribed" });
    const res = makeRes();
    await ctrl.newsLetter(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("getAllNewsLetters", () => {
  it("200 on success", async () => {
    newsletterService.getSubscribers.mockResolvedValue([]);
    const res = makeRes();
    await ctrl.getAllNewsLetters(makeReq(), res);
    expect(res.json).toHaveBeenCalled();
  });
});

// ── product service wrappers ──────────────────────────────────────
describe("products", () => {
  it("200 on success", async () => {
    productService.getProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.products(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    productService.getProducts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.products(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getCategories", () => {
  it("200 on success", async () => {
    productService.getCategories.mockResolvedValue({ categories: [] });
    const res = makeRes();
    await ctrl.getCategories(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("productsDetails", () => {
  it("200 on success", async () => {
    productService.getProductDetails.mockResolvedValue({ product: {} });
    const res = makeRes();
    await ctrl.productsDetails(makeReq({ params: { id: "p1" } }), res);
    expect(res.json).toHaveBeenCalledWith({ product: {} });
  });
  it("500 on error", async () => {
    productService.getProductDetails.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.productsDetails(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("searchProduct", () => {
  it("200 on success", async () => {
    productService.searchProducts.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.searchProduct(makeReq({ body: { q: "test" } }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("passes structured error", async () => {
    productService.searchProducts.mockRejectedValue({ status: 400, message: "bad query", data: { suggestion: null } });
    const res = makeRes();
    await ctrl.searchProduct(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    productService.searchProducts.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.searchProduct(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("categoriesProduct", () => {
  it("200 on success", async () => {
    productService.getCategoriesProduct.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.categoriesProduct(makeReq({ params: { id: "cat1" }, query: {} }), res);
    expect(res.json).toHaveBeenCalled();
  });
});

// ── cms service wrappers ──────────────────────────────────────────
describe("getCmsData", () => {
  it("200 on success", async () => {
    cmsService.getCmsData.mockResolvedValue({ data: {} });
    const res = makeRes();
    await ctrl.getCmsData(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.getCmsData.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getCmsData(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getCouponCms", () => {
  it("200 on success", async () => {
    cmsService.getCouponCms.mockResolvedValue({ data: {} });
    const res = makeRes();
    await ctrl.getCouponCms(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.getCouponCms.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getCouponCms(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getCronLogs ───────────────────────────────────────────────────
describe("getCronLogs", () => {
  let CronModel;
  beforeAll(() => { CronModel = require("../../../src/repositories").cronJoblogs.rawModel(); });

  it("200 returns logs on success", async () => {
    CronModel.find.mockResolvedValue([{ log: "ok" }]);
    const res = makeRes();
    await ctrl.getCronLogs(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ log: "ok" }]);
  });
  it("500 on db error", async () => {
    CronModel.find.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getCronLogs(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── CMS array handler tests (call the last element of the array) ──
// Helper: invoke the inner handler of a [middleware, handler] pair
const innerHandler = (arr) => arr[arr.length - 1];

describe("featuresCms", () => {
  it("200 on success", async () => {
    cmsService.updateFeatures.mockResolvedValue({ ok: true });
    const res = makeRes();
    await ctrl.featuresCms(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateFeatures.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.featuresCms(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("contactCms", () => {
  it("200 on success", async () => {
    cmsService.updateContact.mockResolvedValue({ ok: true });
    const res = makeRes();
    await ctrl.contactCms(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateContact.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.contactCms(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("CouponCms handler", () => {
  it("200 on success with files", async () => {
    cmsService.updateCouponCms.mockResolvedValue({ ok: true });
    const req = makeReq({ files: { logo: [{ filename: "logo.png" }], mrBazaarLogo: [{ filename: "mr.png" }] } });
    const res = makeRes();
    await innerHandler(ctrl.CouponCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(cmsService.updateCouponCms).toHaveBeenCalledWith(req.body, {
      logo: { filename: "logo.png" },
      mrBazaarLogo: { filename: "mr.png" },
    });
  });
  it("200 with no files (null)", async () => {
    cmsService.updateCouponCms.mockResolvedValue({ ok: true });
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.CouponCms)(req, res);
    expect(cmsService.updateCouponCms).toHaveBeenCalledWith(req.body, { logo: null, mrBazaarLogo: null });
  });
  it("500 on error", async () => {
    cmsService.updateCouponCms.mockRejectedValue({ status: 500, message: "fail" });
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.CouponCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("headerInfoCms handler", () => {
  it("200 on success", async () => {
    cmsService.updateHeader.mockResolvedValue({ ok: true });
    const req = makeReq({ files: { logo: [{ filename: "logo.png" }] } });
    const res = makeRes();
    await innerHandler(ctrl.headerInfoCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateHeader.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.headerInfoCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("sliderCms handler", () => {
  it("200 on success with all slider images", async () => {
    cmsService.updateSlider.mockResolvedValue({ ok: true });
    const req = makeReq({ files: {
      sliderImage1: [{ filename: "s1.png" }],
      sliderImage2: [{ filename: "s2.png" }],
      sliderImage3: [{ filename: "s3.png" }],
    }});
    const res = makeRes();
    await innerHandler(ctrl.sliderCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateSlider.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.sliderCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("offersCms handler", () => {
  it("200 on success", async () => {
    cmsService.updateOffers.mockResolvedValue({ ok: true });
    const req = makeReq({ files: [{ filename: "o1.png" }] });
    const res = makeRes();
    await innerHandler(ctrl.offersCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateOffers.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: [] });
    const res = makeRes();
    await innerHandler(ctrl.offersCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("categoryImagesCms handler", () => {
  it("200 on success with category images", async () => {
    cmsService.updateCategoryImages.mockResolvedValue({ ok: true });
    const req = makeReq({ files: {
      Electronics: [{ filename: "e.png" }],
      Home: [{ filename: "h.png" }],
      Sports: [],
      Toys: [],
      Home_Improvement: [],
    }});
    const res = makeRes();
    await innerHandler(ctrl.categoryImagesCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateCategoryImages.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: { Electronics: [], Home: [], Sports: [], Toys: [], Home_Improvement: [] } });
    const res = makeRes();
    await innerHandler(ctrl.categoryImagesCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("offerFilterCms handler", () => {
  it("200 on success", async () => {
    cmsService.updateOfferFilter.mockResolvedValue({ ok: true });
    const req = makeReq({ files: { Image1: [{ filename: "i1.png" }], Image2: [{ filename: "i2.png" }] } });
    const res = makeRes();
    await innerHandler(ctrl.offerFilterCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateOfferFilter.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.offerFilterCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("FooterInfoCms handler", () => {
  it("200 on success", async () => {
    cmsService.updateFooter.mockResolvedValue({ ok: true });
    const req = makeReq({ files: { logo: [{ filename: "logo.png" }] } });
    const res = makeRes();
    await innerHandler(ctrl.FooterInfoCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateFooter.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.FooterInfoCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("AboutCms handler", () => {
  it("200 on success", async () => {
    cmsService.updateAbout.mockResolvedValue({ ok: true });
    const req = makeReq({ files: { backgroundImage: [{ filename: "bg.png" }] } });
    const res = makeRes();
    await innerHandler(ctrl.AboutCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateAbout.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.AboutCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("ShopCms handler", () => {
  it("200 on success", async () => {
    cmsService.updateShop.mockResolvedValue({ ok: true });
    const req = makeReq({ files: { Image1: [{ filename: "i1.png" }], Image2: [{ filename: "i2.png" }] } });
    const res = makeRes();
    await innerHandler(ctrl.ShopCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    cmsService.updateShop.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.ShopCms)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("BrandsLogo handler", () => {
  it("200 on success with logo files", async () => {
    cmsService.updateBrandsLogo.mockResolvedValue({ ok: true });
    const files = {};
    files["logo0"] = [{ filename: "brand0.png" }];
    files["logo5"] = [{ filename: "brand5.png" }];
    const req = makeReq({ files });
    const res = makeRes();
    await innerHandler(ctrl.BrandsLogo)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const callArgs = cmsService.updateBrandsLogo.mock.calls[0][1];
    expect(callArgs["logo0"]).toEqual({ filename: "brand0.png" });
    expect(callArgs["logo5"]).toEqual({ filename: "brand5.png" });
  });
  it("500 on error", async () => {
    cmsService.updateBrandsLogo.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.BrandsLogo)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("editorBodyImagesUpload handler", () => {
  it("200 on success with file", async () => {
    cmsService.uploadEditorImage.mockResolvedValue({ url: "https://example.com/img.png" });
    const req = makeReq({ files: { file: [{ filename: "img.png" }] } });
    const res = makeRes();
    await innerHandler(ctrl.editorBodyImagesUpload)(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(cmsService.uploadEditorImage).toHaveBeenCalledWith("img.png");
  });
  it("200 with no file (null filename)", async () => {
    cmsService.uploadEditorImage.mockResolvedValue({ url: null });
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.editorBodyImagesUpload)(req, res);
    expect(cmsService.uploadEditorImage).toHaveBeenCalledWith(null);
  });
  it("500 on error", async () => {
    cmsService.uploadEditorImage.mockRejectedValue(new Error("fail"));
    const req = makeReq({ files: {} });
    const res = makeRes();
    await innerHandler(ctrl.editorBodyImagesUpload)(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("deleteFileByUrl", () => {
  it("200 on success", async () => {
    cmsService.deleteEditorImage.mockResolvedValue({ deleted: true });
    const req = makeReq({ body: { imageUrl: "https://example.com/img.png" } });
    const res = makeRes();
    await ctrl.deleteFileByUrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(cmsService.deleteEditorImage).toHaveBeenCalledWith("https://example.com/img.png");
  });
  it("500 on error", async () => {
    cmsService.deleteEditorImage.mockRejectedValue(new Error("fail"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.deleteFileByUrl(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── product service wrappers (missing ones) ───────────────────────
describe("fetchAllProducts", () => {
  it("returns products on success", async () => {
    productService.getAllProducts.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await ctrl.fetchAllProducts(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });
  it("500 on error", async () => {
    productService.getAllProducts.mockRejectedValue({ status: 500, message: "fail" });
    const res = makeRes();
    await ctrl.fetchAllProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("fetchHomeProducts", () => {
  it("returns home products wrapped in result", async () => {
    productService.getHomeProducts.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await ctrl.fetchHomeProducts(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ result: [{ id: 1 }] });
  });
  it("500 on error", async () => {
    productService.getHomeProducts.mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.fetchHomeProducts(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("searchSingleProduct", () => {
  it("returns result on success", async () => {
    productService.searchSingleProduct.mockResolvedValue({ id: 1 });
    const req = makeReq({ body: { item_name: "Widget" } });
    const res = makeRes();
    await ctrl.searchSingleProduct(req, res);
    expect(res.json).toHaveBeenCalledWith({ id: 1 });
  });
  it("500 on error", async () => {
    productService.searchSingleProduct.mockRejectedValue({ status: 500, message: "fail" });
    const res = makeRes();
    await ctrl.searchSingleProduct(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getCategoryNameById", () => {
  it("200 on success", async () => {
    productService.getCategoryNameById.mockResolvedValue({ name: "Electronics" });
    const res = makeRes();
    await ctrl.getCategoryNameById(makeReq({ params: { id: "cat1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    productService.getCategoryNameById.mockRejectedValue({ status: 500 });
    const res = makeRes();
    await ctrl.getCategoryNameById(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getBrandNameById", () => {
  it("returns brand name on success", async () => {
    productService.getBrandNameById.mockResolvedValue({ name: "Sony" });
    const res = makeRes();
    await ctrl.getBrandNameById(makeReq({ params: { id: "b1" } }), res);
    expect(res.json).toHaveBeenCalledWith({ name: "Sony" });
  });
  it("500 on error", async () => {
    productService.getBrandNameById.mockRejectedValue({ status: 500 });
    const res = makeRes();
    await ctrl.getBrandNameById(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("brands", () => {
  it("returns brands on success", async () => {
    productService.getBrands.mockResolvedValue([{ name: "Sony" }]);
    const res = makeRes();
    await ctrl.brands(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ name: "Sony" }]);
  });
  it("500 on error", async () => {
    productService.getBrands.mockRejectedValue({ status: 500, message: "fail" });
    const res = makeRes();
    await ctrl.brands(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("allCategories", () => {
  it("returns categories on success", async () => {
    productService.getAllCategories.mockResolvedValue([{ name: "Electronics" }]);
    const res = makeRes();
    await ctrl.allCategories(makeReq(), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    productService.getAllCategories.mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.allCategories(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("subCategoriesProduct", () => {
  it("returns products on success", async () => {
    productService.getSubCategoriesProduct.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.subCategoriesProduct(makeReq({ params: { id: "sub1" }, query: {} }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    productService.getSubCategoriesProduct.mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.subCategoriesProduct(makeReq({ params: { id: "bad" }, query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("subSubCategoriesProduct", () => {
  it("returns products on success", async () => {
    productService.getSubSubCategoriesProduct.mockResolvedValue({ products: [] });
    const res = makeRes();
    await ctrl.subSubCategoriesProduct(makeReq({ params: { id: "ssub1" }, query: {} }), res);
    expect(res.json).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    productService.getSubSubCategoriesProduct.mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.subSubCategoriesProduct(makeReq({ params: { id: "bad" }, query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("randomProducts", () => {
  it("returns result on success", async () => {
    productService.getRandomProducts.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await ctrl.randomProducts(makeReq({ params: { id: "cat1" } }), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });
  it("500 on error", async () => {
    productService.getRandomProducts.mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.randomProducts(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("similarProducts", () => {
  it("returns similar products on success", async () => {
    productService.getSimilarProducts.mockResolvedValue([{ id: 2 }]);
    const req = makeReq({ params: { id: "cat1" }, headers: { "product-id": "p1" } });
    const res = makeRes();
    await ctrl.similarProducts(req, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 2 }]);
  });
  it("500 on error", async () => {
    productService.getSimilarProducts.mockRejectedValue({ status: 500, message: "fail" });
    const res = makeRes();
    await ctrl.similarProducts(makeReq({ params: { id: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("fetchDbProducts", () => {
  it("returns db products on success", async () => {
    productService.fetchDbProducts.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await ctrl.fetchDbProducts(makeReq({ query: {} }), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });
  it("500 on error", async () => {
    productService.fetchDbProducts.mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.fetchDbProducts(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("fetchProductsNoImages", () => {
  it("returns products on success", async () => {
    productService.fetchProductsNoImages.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await ctrl.fetchProductsNoImages(makeReq({ query: {} }), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });
  it("500 on error", async () => {
    productService.fetchProductsNoImages.mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.fetchProductsNoImages(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── sendBulkEmails ────────────────────────────────────────────────
describe("sendBulkEmails", () => {
  it("200 on success", async () => {
    newsletterService.sendBulkEmails.mockResolvedValue({ sent: 5 });
    const req = makeReq({ body: { to: ["a@b.com"], subject: "Hi", body: "<p>hello</p>", cc: [], bcc: [] } });
    const res = makeRes();
    ctrl.sendBulkEmails(req, res);
    await new Promise(resolve => setImmediate(resolve));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sent: 5 });
  });
  it("passes status error on failure", async () => {
    newsletterService.sendBulkEmails.mockRejectedValue({ status: 400, message: "bad emails" });
    const req = makeReq({ body: { to: [], subject: "Hi", body: "<p>hi</p>" } });
    const res = makeRes();
    ctrl.sendBulkEmails(req, res);
    await new Promise(resolve => setImmediate(resolve));
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    newsletterService.sendBulkEmails.mockRejectedValue(new Error("smtp down"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    ctrl.sendBulkEmails(req, res);
    await new Promise(resolve => setImmediate(resolve));
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── search (inline DB handler) ────────────────────────────────────
describe("search", () => {
  let ProductModel;
  beforeAll(() => { ProductModel = require("../../../src/repositories").products.rawModel(); });

  it("400 when search term is missing", async () => {
    const res = makeRes();
    await ctrl.search(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Search term is required" });
  });

  it("returns filtered products on success", async () => {
    ProductModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            status: true,
            totalQty: 5,
            variantsData: [{ sku: "SKU1" }],
            product: {
              id: "p1",
              name: "Widget",
              description: "A widget",
              product_type_id: "type1",
              images: ["img1.png"],
            },
          },
        ]),
      }),
    });
    const res = makeRes();
    await ctrl.search(makeReq({ body: { search: "Widget" } }), res);
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(Array.isArray(result)).toBe(true);
  });

  it("filters out products with no variantsData or images", async () => {
    ProductModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { status: true, totalQty: 5, variantsData: [], product: { id: "p2", name: "Bad", images: [] } },
          { status: false, totalQty: 5, variantsData: [{}], product: { id: "p3", name: "Inactive", images: ["x.png"] } },
        ]),
      }),
    });
    const res = makeRes();
    await ctrl.search(makeReq({ body: { search: "test" } }), res);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("500 on db error", async () => {
    ProductModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error("db fail")),
      }),
    });
    const res = makeRes();
    await ctrl.search(makeReq({ body: { search: "Widget" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── addReview ─────────────────────────────────────────────────────
describe("addReview", () => {
  let ReviewModel;
  beforeAll(() => { ReviewModel = require("../../../src/repositories").reviews.rawModel(); });

  it("creates review and returns list", async () => {
    const mockReview = {
      userId: "u1", nickname: "tester", summary: "Great", texttext: "Love it",
      product_id: "prod1", quality_rating: 5, value_rating: 5, price_rating: 5,
    };
    ReviewModel.create.mockResolvedValue(mockReview);
    ReviewModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockReview]),
      }),
    });
    const req = makeReq({ body: {
      nickname: "tester", summary: "Great", texttext: "Love it",
      product_id: "prod1", quality_rating: 5, value_rating: 5, price_rating: 5,
    }});
    const res = makeRes();
    await ctrl.addReview(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Review created successfully" }));
  });

  it("500 on create error", async () => {
    ReviewModel.create.mockRejectedValue(new Error("db fail"));
    const res = makeRes();
    await ctrl.addReview(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── review ────────────────────────────────────────────────────────
describe("review", () => {
  let ReviewModel;
  beforeAll(() => { ReviewModel = require("../../../src/repositories").reviews.rawModel(); });

  it("returns reviews with productId mapped", async () => {
    const mockReviewDoc = {
      toObject: () => ({
        _id: "r1",
        nickname: "tester",
        product_id: { _id: "prod_id_1", product: { id: "ls_prod_1" } },
      }),
    };
    ReviewModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockReviewDoc]),
      }),
    });
    const res = makeRes();
    await ctrl.review(makeReq(), res);
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.reviews[0].productId).toBe("ls_prod_1");
    expect(result.reviews[0].product_id).toBe("prod_id_1");
  });

  it("returns reviews without productId when product_id has no product.id", async () => {
    const mockReviewDoc = {
      toObject: () => ({
        _id: "r2",
        nickname: "anon",
        product_id: null,
      }),
    };
    ReviewModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockReviewDoc]),
      }),
    });
    const res = makeRes();
    await ctrl.review(makeReq(), res);
    const result = res.json.mock.calls[0][0];
    expect(result.reviews[0].productId).toBeUndefined();
  });

  it("500 on db error", async () => {
    ReviewModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error("db fail")),
      }),
    });
    const res = makeRes();
    await ctrl.review(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── contactUs handler ─────────────────────────────────────────────
describe("contactUs handler", () => {
  const handler = innerHandler(ctrl.contactUs);

  it("400 when email is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ body: { name: "John", message: "Hello", phone: "123", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Email") }));
  });

  it("400 when name is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", message: "Hello", phone: "123", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Name is required" });
  });

  it("400 when message is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", phone: "123", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Message is required" });
  });

  it("400 when phone is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Phone Number is required" });
  });

  it("400 when recaptchaToken is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "reCAPTCHA verification is required" });
  });

  it("500 when recaptcha credentials not configured", async () => {
    const savedKey = process.env.RECAPTCHA_API_KEY;
    const savedProject = process.env.GOOGLE_CLOUD_PROJECT_ID;
    delete process.env.RECAPTCHA_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    process.env.RECAPTCHA_API_KEY = savedKey;
    process.env.GOOGLE_CLOUD_PROJECT_ID = savedProject;
  });

  it("403 when recaptcha token is invalid", async () => {
    process.env.RECAPTCHA_API_KEY = "test_key";
    process.env.GOOGLE_CLOUD_PROJECT_ID = "test_project";
    axios.post = jest.fn().mockResolvedValue({
      data: {
        tokenProperties: { valid: false, invalidReason: "EXPIRED" },
        riskAnalysis: { score: 0.9 },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123", recaptchaToken: "bad_tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("verification failed") }));
  });

  it("403 when recaptcha action is wrong", async () => {
    process.env.RECAPTCHA_API_KEY = "test_key";
    process.env.GOOGLE_CLOUD_PROJECT_ID = "test_project";
    axios.post = jest.fn().mockResolvedValue({
      data: {
        tokenProperties: { valid: true, action: "wrong_action" },
        riskAnalysis: { score: 0.9 },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid verification action" });
  });

  it("403 when recaptcha score is too low", async () => {
    process.env.RECAPTCHA_API_KEY = "test_key";
    process.env.GOOGLE_CLOUD_PROJECT_ID = "test_project";
    axios.post = jest.fn().mockResolvedValue({
      data: {
        tokenProperties: { valid: true, action: "contact_form" },
        riskAnalysis: { score: 0.1 },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Suspicious") }));
  });

  it("200 on successful submission without file", async () => {
    process.env.RECAPTCHA_API_KEY = "test_key";
    process.env.GOOGLE_CLOUD_PROJECT_ID = "test_project";
    axios.post = jest.fn().mockResolvedValue({
      data: {
        tokenProperties: { valid: true, action: "contact_form" },
        riskAnalysis: { score: 0.9 },
      },
    });
    const emailService = require("../../../src/mail/emailService");
    emailService.sendEmail.mockResolvedValue(undefined);
    const emailHelper = require("../../../src/utilities/emailHelper");
    emailHelper.getAdminEmail.mockResolvedValue("admin@test.com");
    const res = makeRes();
    const req = makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123", recaptchaToken: "tok" } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Thank you") }));
  });

  it("200 on successful submission with file attachment", async () => {
    process.env.RECAPTCHA_API_KEY = "test_key";
    process.env.GOOGLE_CLOUD_PROJECT_ID = "test_project";
    process.env.BACKEND_URL = "https://api.example.com";
    axios.post = jest.fn().mockResolvedValue({
      data: {
        tokenProperties: { valid: true, action: "contact_form" },
        riskAnalysis: { score: 0.9 },
      },
    });
    const emailService = require("../../../src/mail/emailService");
    emailService.sendEmail.mockResolvedValue(undefined);
    const res = makeRes();
    const req = makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123", recaptchaToken: "tok" } });
    req.file = { filename: "attachment.pdf" };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("500 on sendEmail error", async () => {
    process.env.RECAPTCHA_API_KEY = "test_key";
    process.env.GOOGLE_CLOUD_PROJECT_ID = "test_project";
    axios.post = jest.fn().mockResolvedValue({
      data: {
        tokenProperties: { valid: true, action: "contact_form" },
        riskAnalysis: { score: 0.9 },
      },
    });
    const emailService = require("../../../src/mail/emailService");
    emailService.sendEmail.mockRejectedValue(new Error("smtp fail"));
    const res = makeRes();
    await handler(makeReq({ body: { email: "a@b.com", name: "John", message: "Hello", phone: "123", recaptchaToken: "tok" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
  });
});

// ── downloadFile ──────────────────────────────────────────────────
describe("downloadFile", () => {
  it("pipes stream to response on success", async () => {
    const { Readable } = require("stream");
    const mockStream = new Readable({ read() {} });
    axios.get = jest.fn().mockResolvedValue({
      data: { pipe: jest.fn() },
    });
    const req = makeReq({ query: { url: "https://example.com/file.pdf" } });
    const res = makeRes();
    await ctrl.downloadFile(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="file.pdf"');
    expect(axios.get).toHaveBeenCalledWith("https://example.com/file.pdf", { responseType: "stream" });
  });

  it("500 on download error", async () => {
    axios.get = jest.fn().mockRejectedValue(new Error("network fail"));
    const req = makeReq({ query: { url: "https://example.com/file.pdf" } });
    const res = makeRes();
    await ctrl.downloadFile(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("Failed to download the file.");
  });
});

// ── productDetails (inline Lightspeed API handler) ────────────────
describe("productDetails", () => {
  it("returns product with no variants (simple inventory)", async () => {
    axios.get = jest.fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            id: "ls_p1",
            name: "Widget",
            sku_number: "SKU1",
            price_standard: { tax_inclusive: "100.00" },
            variants: [],
            product_type_id: "type1",
          },
        },
      })
      .mockResolvedValueOnce({
        data: { data: [{ inventory_level: 10 }] },
      });
    const req = makeReq({ params: { id: "ls_p1" } });
    const res = makeRes();
    await ctrl.productDetails(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      variantsData: expect.arrayContaining([expect.objectContaining({ qty: 10 })]),
      totalQty: 10,
    }));
  });

  it("returns product with variants", async () => {
    axios.get = jest.fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            id: "ls_p2",
            name: "Shirt",
            variants: [
              {
                id: "v1",
                primary_sku_code: "SKU-V1",
                name: "Red",
                price_standard: { tax_inclusive: "50.00" },
                variant_definitions: [{ value: "Red" }, { value: "M" }],
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { data: [{ inventory_level: 3 }] },
      });
    const req = makeReq({ params: { id: "ls_p2" } });
    const res = makeRes();
    await ctrl.productDetails(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalQty: 3 }));
    const callArg = res.json.mock.calls[0][0];
    expect(callArg.variantsData[0].sku).toBe("Red - M");
  });

  it("404 when product has error field", async () => {
    axios.get = jest.fn().mockResolvedValueOnce({
      data: { error: "not found", data: null },
    });
    const req = makeReq({ params: { id: "bad_id" } });
    const res = makeRes();
    await ctrl.productDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Product not found." });
  });

  it("zero inventory variant is excluded from variantsData", async () => {
    axios.get = jest.fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            id: "ls_p3",
            name: "Socks",
            variants: [],
            sku_number: "S1",
            price_standard: { tax_inclusive: "10.00" },
          },
        },
      })
      .mockResolvedValueOnce({
        data: { data: [{ inventory_level: 0 }] },
      });
    const req = makeReq({ params: { id: "ls_p3" } });
    const res = makeRes();
    await ctrl.productDetails(req, res);
    const result = res.json.mock.calls[0][0];
    expect(result.variantsData).toHaveLength(0);
    expect(result.totalQty).toBe(0);
  });

  it("500 on axios error", async () => {
    axios.get = jest.fn().mockRejectedValue(new Error("network fail"));
    const req = makeReq({ params: { id: "ls_p1" } });
    const res = makeRes();
    await ctrl.productDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch product details" });
  });
});

// ── updateProductDetails ──────────────────────────────────────────
describe("updateProductDetails", () => {
  let ProductModel;
  beforeAll(() => { ProductModel = require("../../../src/repositories").products.rawModel(); });

  it("returns updated product on success", async () => {
    // fetchProductDetails uses axios.get internally
    axios.get = jest.fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            id: "ls_p1",
            variants: [],
            sku_number: "S1",
            price_standard: { tax_inclusive: "100.00" },
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: [{ inventory_level: 5 }] } });
    ProductModel.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "mongo1", "product.id": "ls_p1" });
    const req = makeReq({ params: { id: "ls_p1" } });
    const res = makeRes();
    await ctrl.updateProductDetails(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("updated successfully") }));
  });

  it("404 when product not found in DB", async () => {
    axios.get = jest.fn()
      .mockResolvedValueOnce({
        data: { data: { id: "ls_missing", variants: [], sku_number: "X", price_standard: { tax_inclusive: "10" } } },
      })
      .mockResolvedValueOnce({ data: { data: [{ inventory_level: 1 }] } });
    ProductModel.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    const req = makeReq({ params: { id: "ls_missing" } });
    const res = makeRes();
    await ctrl.updateProductDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Product not found in the database." });
  });

  it("500 on axios/db error", async () => {
    axios.get = jest.fn().mockRejectedValue(new Error("fail"));
    const req = makeReq({ params: { id: "bad" } });
    const res = makeRes();
    await ctrl.updateProductDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── categories export ─────────────────────────────────────────────
describe("categories", () => {
  let ProductModel, CategoryModel;
  beforeAll(() => {
    ProductModel = require("../../../src/repositories").products.rawModel();
    CategoryModel = require("../../../src/repositories").categories.rawModel();
  });

  it("returns success when no categories from Lightspeed", async () => {
    axios.get = jest.fn().mockResolvedValue({
      data: { data: { data: { categories: [] } } },
    });
    ProductModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    CategoryModel.findOne.mockResolvedValue({ _id: "existing" });
    const res = makeRes();
    await ctrl.categories(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns success when categories already exist in DB", async () => {
    axios.get = jest.fn().mockResolvedValue({
      data: { data: { data: { categories: [] } } },
    });
    ProductModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    CategoryModel.findOne.mockResolvedValue({ _id: "existing" });
    const res = makeRes();
    await ctrl.categories(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("500 when Product.find throws", async () => {
    // fetchCategories silently catches; Product.find throws
    axios.get = jest.fn().mockResolvedValue({
      data: { data: { data: { categories: [] } } },
    });
    ProductModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error("db fail")) }),
    });
    const res = makeRes();
    await ctrl.categories(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── verifyTabbyPayment logActivity error path ─────────────────────
// (tabbyWebhook already tested; verifyTabbyPayment 500 unknown error path)
describe("verifyTabbyPayment 500 unknown error (logActivity branch)", () => {
  it("logs activity and returns 500 on unknown error", async () => {
    checkoutService.verifyTabbyPayment.mockRejectedValue(new Error("unknown"));
    const req = makeReq({ body: { paymentId: "pay_1" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.verifyTabbyPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });
});

// ── createTabbyCheckout logActivity error path ────────────────────
describe("createTabbyCheckout logActivity on unknown error", () => {
  it("logs activity and returns 500", async () => {
    checkoutService.createTabbyCheckout.mockRejectedValue(new Error("unexpected"));
    const req = makeReq({ body: { cartData: [] }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.createTabbyCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── handleServiceError branches ───────────────────────────────────
describe("handleServiceError via coupon endpoint — error.error field", () => {
  it("includes error.error in response body when present", async () => {
    couponService.getCoupons.mockRejectedValue({ status: 422, message: "unprocessable", error: "INVALID_COUPON" });
    const res = makeRes();
    await ctrl.coupons(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ message: "unprocessable", error: "INVALID_COUPON" });
  });
});

// ── getAllNewsLetters error path ───────────────────────────────────
describe("getAllNewsLetters error path", () => {
  it("passes status error", async () => {
    newsletterService.getSubscribers.mockRejectedValue({ status: 503, message: "unavailable" });
    const res = makeRes();
    await ctrl.getAllNewsLetters(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

// ── updateProductDetails with variant path ────────────────────────
describe("updateProductDetails variant path", () => {
  let ProductModel;
  beforeAll(() => { ProductModel = require("../../../src/repositories").products.rawModel(); });

  it("handles product with variants", async () => {
    axios.get = jest.fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            id: "ls_p5",
            variants: [
              {
                id: "v1",
                price_standard: { tax_inclusive: "75.00" },
                variant_definitions: [{ value: "Blue" }],
                name: "Blue variant",
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: [{ inventory_level: 8 }] } });
    ProductModel.findOneAndUpdate = jest.fn().mockResolvedValue({ "product.id": "ls_p5" });
    const req = makeReq({ params: { id: "ls_p5" } });
    const res = makeRes();
    await ctrl.updateProductDetails(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("updated") }));
  });
});

// ── getIdss ───────────────────────────────────────────────────────
describe("getIdss", () => {
  let ProductIdModel;
  beforeAll(() => { ProductIdModel = require("../../../src/repositories").productIds.rawModel(); });

  it("returns 404 when no product IDs in DB", async () => {
    // fetchProducts returns []
    axios.get = jest.fn()
      // fetchProducts call
      .mockResolvedValueOnce({ data: { data: [] } })
      // filterProductsByInventory: inventory page
      .mockResolvedValueOnce({ data: { data: [], version: { max: "" } } });
    ProductIdModel.findOne = jest.fn().mockResolvedValue(null);
    ProductIdModel.find = jest.fn().mockResolvedValue([]);
    const res = makeRes();
    res.headersSent = false;
    res.socket = { writable: true };
    const req = { ...makeReq(), on: jest.fn() };
    await ctrl.getIdss(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("500 on error with connected client", async () => {
    axios.get = jest.fn().mockRejectedValue(new Error("network"));
    const res = makeRes();
    res.headersSent = false;
    res.socket = { writable: true };
    const req = { ...makeReq(), on: jest.fn() };
    await ctrl.getIdss(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getIdsss ──────────────────────────────────────────────────────
describe("getIdsss", () => {
  let ProductIdModel;
  beforeAll(() => { ProductIdModel = require("../../../src/repositories").productIds.rawModel(); });

  it("returns 200 when no missing product IDs", async () => {
    axios.get = jest.fn()
      // fetchProducts
      .mockResolvedValueOnce({ data: { data: [{ id: "p1", is_active: true }] } })
      // filterProductsByInventory inventory
      .mockResolvedValueOnce({ data: { data: [{ product_id: "p1", inventory_level: 5 }], version: { max: "" } } });
    ProductIdModel.find = jest.fn().mockResolvedValue([{ productId: "p1" }]);
    const res = makeRes();
    await ctrl.getIdsss(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "All product IDs are already in the database." });
  });

  it("processes missing IDs - fetches from Lightspeed", async () => {
    axios.get = jest.fn()
      // fetchProducts
      .mockResolvedValueOnce({ data: { data: [{ id: "p_new", is_active: true }] } })
      // filterProductsByInventory
      .mockResolvedValueOnce({ data: { data: [{ product_id: "p_new", inventory_level: 2 }], version: { max: "" } } })
      // fetchProductDetails for p_new: product call
      .mockResolvedValueOnce({ data: { data: { id: "p_new", variants: [], sku_number: "S", price_standard: { tax_inclusive: "20" } } } })
      // fetchProductDetails for p_new: inventory call
      .mockResolvedValueOnce({ data: { data: [{ inventory_level: 2 }] } });
    ProductIdModel.find = jest.fn().mockResolvedValue([]);
    ProductIdModel.create = jest.fn().mockResolvedValue({ productId: "p_new" });
    const ProductModel = require("../../../src/repositories").products.rawModel();
    // Product.findOne for storeProductDetails — make it return existing so updateOne is called
    ProductModel.findOne = jest.fn().mockResolvedValue({ "product.id": "p_new" });
    ProductModel.updateOne = jest.fn().mockResolvedValue({});
    const res = makeRes();
    res.headersSent = false;
    res.socket = { writable: true };
    await ctrl.getIdsss(makeReq(), res);
    // fetchProducts (1) + filterProductsByInventory inventory (1) = 2 axios calls minimum
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(ProductIdModel.create).toHaveBeenCalledWith({ productId: "p_new" });
  });

  it("500 on axios error", async () => {
    axios.get = jest.fn().mockRejectedValue(new Error("fail"));
    const res = makeRes();
    await ctrl.getIdsss(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── categories with complex tree data ────────────────────────────
describe("categories with nested category tree", () => {
  let ProductModel, CategoryModel;
  beforeAll(() => {
    ProductModel = require("../../../src/repositories").products.rawModel();
    CategoryModel = require("../../../src/repositories").categories.rawModel();
  });

  it("builds category tree and returns success when categories exist in DB", async () => {
    axios.get = jest.fn().mockResolvedValue({
      data: {
        data: {
          data: {
            categories: [
              {
                id: "sub1",
                category_path: [
                  { id: "parent1", name: "Electronics" },
                  { id: "sub1", name: "Phones" },
                ],
              },
              {
                id: "sub2",
                category_path: [
                  { id: "parent1", name: "Electronics" },
                  { id: "sub2", name: "Laptops" },
                ],
              },
            ],
          },
        },
      },
    });
    ProductModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { status: true, totalQty: 3, product: { product_type_id: "sub1" } },
          { status: true, totalQty: 0, product: { product_type_id: "sub2" } },
        ]),
      }),
    });
    CategoryModel.findOne.mockResolvedValue({ _id: "existing_cat" });
    const res = makeRes();
    await ctrl.categories(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
