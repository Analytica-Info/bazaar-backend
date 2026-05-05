jest.mock("../../../src/services/authService", () => ({
  register: jest.fn(), loginWithCredentials: jest.fn(), googleLogin: jest.fn(), appleLogin: jest.fn(),
  forgotPassword: jest.fn(), verifyCode: jest.fn(), updatePassword: jest.fn(), updateProfile: jest.fn(),
  resetPassword: jest.fn(), deleteAccount: jest.fn(), deleteAccountPublic: jest.fn(),
  verifyRecoveryCode: jest.fn(), resendRecoveryCode: jest.fn(),
}));
jest.mock("../../../src/services/userService", () => ({
  getUserOrders: jest.fn(), getOrder: jest.fn(), getPaymentHistory: jest.fn(),
  getSinglePaymentHistory: jest.fn(), getDashboard: jest.fn(),
  getCurrentMonthOrderCategories: jest.fn(), addReview: jest.fn(), getUserReviews: jest.fn(),
}));
jest.mock("jsonwebtoken");
jest.mock("../../../src/config/jwtSecret", () => "test_secret");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
const mockNotificationsModel = { find: jest.fn(), updateMany: jest.fn() };
jest.mock("../../../src/repositories", () => ({
  notifications: { rawModel: () => mockNotificationsModel },
}));

const authService = require("../../../src/services/authService");
const userService = require("../../../src/services/userService");
const jwt = require("jsonwebtoken");
const ctrl = require("../../../src/controllers/ecommerce/userController");

const makeReq = (opts = {}) => ({
  user: { _id: "u1", email: "u@t.com", ...opts.user },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  file: opts.file || null,
  cookies: opts.cookies || {},
  headers: opts.headers || {},
  ...opts.extra,
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.cookie = jest.fn().mockReturnValue(r);
  r.redirect = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── register ─────────────────────────────────────────────────────
describe("register", () => {
  it("201 on new user", async () => {
    authService.register.mockResolvedValue({ restored: false });
    const req = makeReq({ body: { name: "A", email: "a@b.com", phone: "123", password: "pw" } });
    const res = makeRes();
    await ctrl.register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("200 on restored account", async () => {
    authService.register.mockResolvedValue({ restored: true });
    const req = makeReq({ body: { name: "A", email: "a@b.com" } });
    const res = makeRes();
    await ctrl.register(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.register.mockRejectedValue({ status: 409, message: "exists" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.register(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    authService.register.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.register(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── login ─────────────────────────────────────────────────────────
describe("login", () => {
  it("200 on success, sets cookie", async () => {
    authService.loginWithCredentials.mockResolvedValue({
      tokens: { accessToken: "tok" }, cookieMaxAge: 3600000
    });
    const req = makeReq({ body: { email: "a@b.com", password: "pw" } });
    const res = makeRes();
    await ctrl.login(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith("user_token", "tok", expect.any(Object));
  });
  it("passes status error", async () => {
    authService.loginWithCredentials.mockRejectedValue({ status: 401, message: "wrong" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── googleLogin ───────────────────────────────────────────────────
describe("googleLogin", () => {
  it("200 on success", async () => {
    authService.googleLogin.mockResolvedValue({ tokens: { accessToken: "g_tok", refreshToken: "r_tok" }, cookieMaxAge: 3600 });
    const req = makeReq({ body: { tokenId: "gid" }, headers: { "user-agent": "browser" } });
    const res = makeRes();
    await ctrl.googleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "r_tok" }));
  });
  it("passes status error", async () => {
    authService.googleLogin.mockRejectedValue({ status: 401, message: "invalid" });
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.googleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── appleLogin ────────────────────────────────────────────────────
describe("appleLogin", () => {
  it("redirects to successUrl on success", async () => {
    authService.appleLogin.mockResolvedValue({ tokens: { accessToken: "a_tok" }, cookieMaxAge: 3600 });
    const req = makeReq({ body: { idToken: "aid", firstName: "A", lastName: "B" } });
    const res = makeRes();
    await ctrl.appleLogin(req, res);
    expect(res.redirect).toHaveBeenCalled();
    const redirectUrl = res.redirect.mock.calls[0][0];
    expect(redirectUrl).toMatch(/apple_login=success/);
  });
  it("redirects to failureUrl on error", async () => {
    authService.appleLogin.mockRejectedValue({ message: "bad token" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.appleLogin(req, res);
    expect(res.redirect).toHaveBeenCalled();
    const redirectUrl = res.redirect.mock.calls[0][0];
    expect(redirectUrl).toMatch(/apple_login=error/);
  });
});

// ── forgotPassword ────────────────────────────────────────────────
describe("forgotPassword", () => {
  it("200 on success", async () => {
    authService.forgotPassword.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com" } });
    const res = makeRes();
    await ctrl.forgotPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.forgotPassword.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.forgotPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── verifyCode ────────────────────────────────────────────────────
describe("verifyCode", () => {
  it("200 on success", async () => {
    authService.verifyCode.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", code: "123456" } });
    const res = makeRes();
    await ctrl.verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── updatePassword ────────────────────────────────────────────────
describe("updatePassword", () => {
  it("401 when no cookie token", async () => {
    const req = makeReq({ cookies: {} });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("401 on invalid token", async () => {
    jwt.verify.mockImplementation(() => { const e = new Error("bad"); e.name = "JsonWebTokenError"; throw e; });
    const req = makeReq({ cookies: { user_token: "bad" } });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
  });
  it("401 on expired token", async () => {
    jwt.verify.mockImplementation(() => { const e = new Error("exp"); e.name = "TokenExpiredError"; throw e; });
    const req = makeReq({ cookies: { user_token: "expired" } });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Token expired" }));
  });
  it("500 on other jwt error", async () => {
    jwt.verify.mockImplementation(() => { throw new Error("other"); });
    const req = makeReq({ cookies: { user_token: "tok" } });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it("200 on success", async () => {
    jwt.verify.mockReturnValue({ id: "u1" });
    authService.updatePassword.mockResolvedValue();
    const req = makeReq({ cookies: { user_token: "valid" }, body: { old_password: "old", new_password: "new" } });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── resetPassword ──────────────────────────────────────────────
describe("resetPassword", () => {
  it("200 on success", async () => {
    authService.resetPassword.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", code: "123", new_password: "new" } });
    const res = makeRes();
    await ctrl.resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── userUpdate ────────────────────────────────────────────────────
describe("userUpdate", () => {
  it("400 when username missing", async () => {
    const req = makeReq({ body: { name: "A" } }); // no username
    const res = makeRes();
    await ctrl.userUpdate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Username is required" }));
  });
  it("200 on success without file", async () => {
    authService.updateProfile.mockResolvedValue({ user: { _id: "u1" } });
    const req = makeReq({ body: { name: "A", username: "uu" } });
    const res = makeRes();
    await ctrl.userUpdate(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── deleteAccount ─────────────────────────────────────────────────
describe("deleteAccount", () => {
  it("200 on success", async () => {
    authService.deleteAccount.mockResolvedValue();
    const req = makeReq({});
    const res = makeRes();
    await ctrl.deleteAccount(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.deleteAccount.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.deleteAccount(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── deleteAccountPublic ──────────────────────────────────────────
describe("deleteAccountPublic", () => {
  it("200 on success", async () => {
    authService.deleteAccountPublic.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", password: "pw" } });
    const res = makeRes();
    await ctrl.deleteAccountPublic(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── verifyRecoveryCode ────────────────────────────────────────────
describe("verifyRecoveryCode", () => {
  it("200 on success", async () => {
    authService.verifyRecoveryCode.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", recoveryCode: "rc", newPassword: "np" } });
    const res = makeRes();
    await ctrl.verifyRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.verifyRecoveryCode.mockRejectedValue({ status: 400, message: "bad code" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.verifyRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── resendRecoveryCode ────────────────────────────────────────────
describe("resendRecoveryCode", () => {
  it("200 on success", async () => {
    authService.resendRecoveryCode.mockResolvedValue({ attemptsUsed: 1, attemptsLeft: 2 });
    const req = makeReq({ body: { email: "a@b.com" } });
    const res = makeRes();
    await ctrl.resendRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ attemptsLeft: 2 }));
  });
  it("passes status error", async () => {
    authService.resendRecoveryCode.mockRejectedValue({ status: 429, message: "too many", attemptsLeft: 0 });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.resendRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});

// ── getNotification ───────────────────────────────────────────────
describe("getNotification", () => {
  it("200 with notifications", async () => {
    mockNotificationsModel.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([{ _id: "n1" }]) }) });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("500 on error", async () => {
    mockNotificationsModel.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockRejectedValue(new Error("db")) }) });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── markNotificationsAsRead ───────────────────────────────────────
describe("markNotificationsAsRead", () => {
  it("400 when ids is empty array", async () => {
    const req = makeReq({ body: { ids: [] } });
    const res = makeRes();
    await ctrl.markNotificationsAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("400 when ids is missing", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.markNotificationsAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("200 on success", async () => {
    mockNotificationsModel.updateMany.mockResolvedValue({ nModified: 1 });
    const req = makeReq({ body: { ids: ["n1", "n2"] } });
    const res = makeRes();
    await ctrl.markNotificationsAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    mockNotificationsModel.updateMany.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: { ids: ["n1"] } });
    const res = makeRes();
    await ctrl.markNotificationsAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── review ────────────────────────────────────────────────────────
describe("review", () => {
  it("200 with products", async () => {
    userService.getUserReviews.mockResolvedValue({ products: [{ _id: "p1" }] });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.review(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("200 empty products", async () => {
    userService.getUserReviews.mockResolvedValue({ products: [] });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.review(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ products: [] }));
  });
  it("500 on error", async () => {
    userService.getUserReviews.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.review(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── addReview ─────────────────────────────────────────────────────
describe("addReview", () => {
  it("200 on success", async () => {
    userService.addReview.mockResolvedValue({ message: "ok", reviews: [] });
    const req = makeReq({ body: { product_id: "p1", name: "A" } });
    const res = makeRes();
    await ctrl.addReview(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "ok" }));
  });
  it("500 on error", async () => {
    userService.addReview.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.addReview(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── orders ────────────────────────────────────────────────────────
describe("orders", () => {
  it("200 with orders", async () => {
    userService.getUserOrders.mockResolvedValue({ orders: [], total_orders: 0, shipped_orders: 0, delivered_orders: 0, canceled_orders: 0 });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.orders(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    userService.getUserOrders.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.orders(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    userService.getUserOrders.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.orders(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── order (single) ────────────────────────────────────────────────
describe("order", () => {
  it("200 on success", async () => {
    userService.getOrder.mockResolvedValue({ orders: [] });
    const req = makeReq({ params: { id: "o1" } });
    const res = makeRes();
    await ctrl.order(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    userService.getOrder.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { id: "bad" } });
    const res = makeRes();
    await ctrl.order(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── paymentHistory ────────────────────────────────────────────────
describe("paymentHistory", () => {
  it("200 on success", async () => {
    userService.getPaymentHistory.mockResolvedValue({ history: [] });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.paymentHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, history: [] }));
  });
  it("passes status error", async () => {
    userService.getPaymentHistory.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.paymentHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── singlePaymentHistory ──────────────────────────────────────────
describe("singlePaymentHistory", () => {
  it("200 on success", async () => {
    userService.getSinglePaymentHistory.mockResolvedValue({ history: {} });
    const req = makeReq({ params: { id: "o1" } });
    const res = makeRes();
    await ctrl.singlePaymentHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── dashboard ─────────────────────────────────────────────────────
describe("dashboard", () => {
  it("200 on success", async () => {
    userService.getDashboard.mockResolvedValue({ recent_orders: [], total_spent: 0, total_orders: 0, active_orders: 0, wishlist_item: 0 });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.dashboard(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    userService.getDashboard.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.dashboard(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── currentMonthOrderCategories ───────────────────────────────────
describe("currentMonthOrderCategories", () => {
  it("200 on success", async () => {
    userService.getCurrentMonthOrderCategories.mockResolvedValue({ data: [], message: "ok" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.currentMonthOrderCategories(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    userService.getCurrentMonthOrderCategories.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.currentMonthOrderCategories(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
