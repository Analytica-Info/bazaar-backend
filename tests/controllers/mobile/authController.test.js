jest.mock("../../../src/services/authService", () => ({
  register: jest.fn(), loginWithCredentials: jest.fn(), googleLogin: jest.fn(), appleLogin: jest.fn(),
  forgotPassword: jest.fn(), verifyCode: jest.fn(), updatePassword: jest.fn(), updateProfile: jest.fn(),
  resetPassword: jest.fn(), deleteAccount: jest.fn(), verifyRecoveryCode: jest.fn(),
  resendRecoveryCode: jest.fn(), refreshToken: jest.fn(), checkAccessToken: jest.fn(),
  getUserData: jest.fn(),
}));
jest.mock("../../../src/services/userService", () => ({
  getMobilePaymentHistory: jest.fn(),
}));
jest.mock("jsonwebtoken");
jest.mock("../../../src/config/jwtSecret", () => "test_secret");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../../src/mail/emailService", () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("axios");
const mockUser = { findById: jest.fn(), findOne: jest.fn() };
const mockCouponsCount = { findOne: jest.fn().mockResolvedValue({ count: 10 }) };

jest.mock("../../../src/repositories", () => {
  const mockSave = jest.fn().mockResolvedValue({ _id: "coupon1", coupon: "DH1YHZXB" });
  const MockCouponMobile = jest.fn().mockImplementation(function(data) {
    Object.assign(this, data);
    this.save = mockSave;
    this.coupon = data.coupon || "DH1YHZXB";
  });
  MockCouponMobile.countDocuments = jest.fn().mockResolvedValue(3);
  MockCouponMobile.findOne = jest.fn();
  MockCouponMobile.find = jest.fn().mockResolvedValue([]);

  return {
    users: { rawModel: () => mockUser },
    couponsMobile: { rawModel: () => MockCouponMobile },
    couponsCount: { rawModel: () => mockCouponsCount },
  };
});

const authService = require("../../../src/services/authService");
const userService = require("../../../src/services/userService");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const ctrl = require("../../../src/controllers/mobile/authController");

const makeReq = (opts = {}) => ({
  user: opts.user || { _id: "u1", email: "u@t.com" },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  headers: opts.headers || {},
  header: jest.fn((h) => (opts.headers || {})[h]),
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── appleLogin ────────────────────────────────────────────────────
describe("appleLogin", () => {
  it("200 on success", async () => {
    authService.appleLogin.mockResolvedValue({
      tokens: { accessToken: "a_tok", refreshToken: "r_tok" },
      user: { _id: "u1" }, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false
    });
    const req = makeReq({ body: { idToken: "aid" } });
    const res = makeRes();
    await ctrl.appleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: "a_tok" }));
  });
  it("passes status error", async () => {
    authService.appleLogin.mockRejectedValue({ status: 401, message: "bad token" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.appleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("500 on unknown error", async () => {
    authService.appleLogin.mockRejectedValue(new Error("sdk err"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.appleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── googleLogin ───────────────────────────────────────────────────
describe("googleLogin", () => {
  it("200 on success", async () => {
    authService.googleLogin.mockResolvedValue({
      tokens: { accessToken: "g_tok", refreshToken: "gr_tok" },
      user: { _id: "u1" }, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false
    });
    const req = makeReq({ body: { tokenId: "gid" }, headers: { "user-agent": "ios" } });
    const res = makeRes();
    await ctrl.googleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: "g_tok" }));
  });
  it("passes status error", async () => {
    authService.googleLogin.mockRejectedValue({ status: 401, message: "bad" });
    const req = makeReq({ body: {}, headers: {} });
    const res = makeRes();
    await ctrl.googleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── register ──────────────────────────────────────────────────────
describe("register", () => {
  it("201 on new user", async () => {
    authService.register.mockResolvedValue({ restored: false });
    const req = makeReq({ body: { name: "A", email: "a@b.com", password: "pw" } });
    const res = makeRes();
    await ctrl.register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("200 on restored account", async () => {
    authService.register.mockResolvedValue({ restored: true });
    const req = makeReq({ body: { name: "A" } });
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
});

// ── login ──────────────────────────────────────────────────────────
describe("login", () => {
  it("200 on success", async () => {
    authService.loginWithCredentials.mockResolvedValue({
      tokens: { accessToken: "tok", refreshToken: "r_tok" },
      fcmToken: null, user: {}, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false
    });
    const req = makeReq({ body: { email: "a@b.com", password: "pw" } });
    const res = makeRes();
    await ctrl.login(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: "tok" }));
  });
  it("passes status error", async () => {
    authService.loginWithCredentials.mockRejectedValue({ status: 401, message: "wrong" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── getUserData ────────────────────────────────────────────────────
describe("getUserData", () => {
  it("200 on success", async () => {
    authService.getUserData.mockResolvedValue({ data: {}, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getUserData(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.getUserData.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getUserData(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
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

// ── resetPassword ─────────────────────────────────────────────────
describe("resetPassword", () => {
  it("200 on success", async () => {
    authService.resetPassword.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", code: "123", new_password: "pw" } });
    const res = makeRes();
    await ctrl.resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── updatePassword ────────────────────────────────────────────────
describe("updatePassword", () => {
  it("401 when no token in Authorization header", async () => {
    const req = makeReq({ body: {}, headers: {} });
    req.header = jest.fn().mockReturnValue(undefined);
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("401 on invalid JWT", async () => {
    const req = makeReq({ headers: { Authorization: "Bearer bad" } });
    req.header = jest.fn().mockReturnValue("bad");
    jwt.verify.mockImplementation(() => { const e = new Error(); e.name = "JsonWebTokenError"; throw e; });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid token" }));
  });
  it("401 on expired JWT", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn().mockReturnValue("expired");
    jwt.verify.mockImplementation(() => { const e = new Error(); e.name = "TokenExpiredError"; throw e; });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Token expired" }));
  });
  it("500 on other JWT error", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn().mockReturnValue("tok");
    jwt.verify.mockImplementation(() => { throw new Error("other"); });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it("200 on success", async () => {
    const req = makeReq({ body: { old_password: "old", new_password: "new" } });
    req.header = jest.fn().mockReturnValue("valid");
    jwt.verify.mockReturnValue({ id: "u1" });
    authService.updatePassword.mockResolvedValue();
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── refreshToken ──────────────────────────────────────────────────
describe("refreshToken", () => {
  it("401 when no token", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn().mockReturnValue(undefined);
    const res = makeRes();
    await ctrl.refreshToken(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("200 on success", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn().mockReturnValue("r_tok");
    authService.refreshToken.mockResolvedValue({ accessToken: "new_a", refreshToken: "new_r" });
    const res = makeRes();
    await ctrl.refreshToken(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "new_a" }));
  });
  it("403 on error", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn().mockReturnValue("bad_r_tok");
    authService.refreshToken.mockRejectedValue(new Error("invalid"));
    const res = makeRes();
    await ctrl.refreshToken(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── checkAccessToken ──────────────────────────────────────────────
describe("checkAccessToken", () => {
  it("401 when access token missing", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn().mockReturnValue(undefined);
    const res = makeRes();
    await ctrl.checkAccessToken(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("200 on success", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn()
      .mockReturnValueOnce("a_tok")
      .mockReturnValueOnce("r_tok");
    authService.checkAccessToken.mockResolvedValue({ valid: true });
    const res = makeRes();
    await ctrl.checkAccessToken(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    const req = makeReq({ headers: {} });
    req.header = jest.fn().mockReturnValue("bad_a_tok");
    authService.checkAccessToken.mockRejectedValue({ status: 401, message: "expired" });
    const res = makeRes();
    await ctrl.checkAccessToken(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── userUpdate ────────────────────────────────────────────────────
describe("userUpdate", () => {
  it("200 on success", async () => {
    authService.updateProfile.mockResolvedValue({ user: { _id: "u1" } });
    const req = makeReq({ body: { name: "A" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.userUpdate(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.updateProfile.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.userUpdate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── customerID ────────────────────────────────────────────────────
describe("customerID", () => {
  it("400 when customerID missing", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.customerID(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("404 when user not found", async () => {
    mockUser.findById.mockResolvedValue(null);
    const req = makeReq({ body: { customerID: "cust1" } });
    const res = makeRes();
    await ctrl.customerID(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("200 on success", async () => {
    mockUser.findById.mockResolvedValue({ _id: "u1", customerId: null, save: jest.fn().mockResolvedValue() });
    const req = makeReq({ body: { customerID: "cust123" } });
    const res = makeRes();
    await ctrl.customerID(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── getCustomerID ─────────────────────────────────────────────────
describe("getCustomerID", () => {
  it("404 when user not found", async () => {
    mockUser.findById.mockResolvedValue(null);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getCustomerID(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("200 on success", async () => {
    mockUser.findById.mockResolvedValue({ customerId: "cust123" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getCustomerID(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust123" }));
  });
  it("500 on error", async () => {
    mockUser.findById.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getCustomerID(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── checkCouponCode ───────────────────────────────────────────────
describe("checkCouponCode", () => {
  it("400 when couponCode missing", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("FIRST15 - valid when not used", async () => {
    mockUser.findById.mockResolvedValue({ usedFirst15Coupon: false });
    const req = makeReq({ body: { couponCode: "FIRST15" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ usedFirst15Coupon: false }));
  });
  it("FIRST15 - 400 when already used", async () => {
    mockUser.findById.mockResolvedValue({ usedFirst15Coupon: true });
    const req = makeReq({ body: { couponCode: "FIRST15" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ usedFirst15Coupon: true }));
  });
  it("FIRST15 - 400 when user not found", async () => {
    mockUser.findById.mockResolvedValue(null);
    const req = makeReq({ body: { couponCode: "FIRST15" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
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

// ── verifyRecoveryCode ────────────────────────────────────────────
describe("verifyRecoveryCode", () => {
  it("200 on success", async () => {
    authService.verifyRecoveryCode.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", recoveryCode: "rc", newPassword: "np" } });
    const res = makeRes();
    await ctrl.verifyRecoveryCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
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
  });
});

// ── getPaymentHistory ─────────────────────────────────────────────
describe("getPaymentHistory", () => {
  it("200 on success", async () => {
    userService.getMobilePaymentHistory.mockResolvedValue({ orders: [] });
    const req = makeReq({ user: { _id: "u1", createdAt: new Date() } });
    const res = makeRes();
    await ctrl.getPaymentHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("500 on error", async () => {
    userService.getMobilePaymentHistory.mockRejectedValue(new Error("db"));
    const req = makeReq({ user: { _id: "u1", createdAt: new Date() } });
    const res = makeRes();
    await ctrl.getPaymentHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── coupons ───────────────────────────────────────────────────────
describe("coupons", () => {
  it("200 with coupon count", async () => {
    const repositories = require("../../../src/repositories");
    const CouponMobile = repositories.couponsMobile.rawModel();
    CouponMobile.countDocuments.mockResolvedValue(5);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.coupons(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 5 }));
  });
  it("500 on db error", async () => {
    const repositories = require("../../../src/repositories");
    const CouponMobile = repositories.couponsMobile.rawModel();
    CouponMobile.countDocuments.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.coupons(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

// ── createCoupon ──────────────────────────────────────────────────
describe("createCoupon", () => {
  it("400 when name or phone missing", async () => {
    const req = makeReq({ body: { name: "A" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.createCoupon(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
  it("404 when user not found", async () => {
    mockUser.findById.mockResolvedValue(null);
    const req = makeReq({ body: { name: "A", phone: "055" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.createCoupon(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("400 when user has no phone", async () => {
    mockUser.findById.mockResolvedValue({ _id: "u1", phone: null });
    const req = makeReq({ body: { name: "A", phone: "055" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.createCoupon(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("400 when phone mismatch", async () => {
    mockUser.findById.mockResolvedValue({ _id: "u1", phone: "056" });
    const req = makeReq({ body: { name: "A", phone: "055" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.createCoupon(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("400 when phone already exists for another user", async () => {
    const repositories = require("../../../src/repositories");
    const CouponMobile = repositories.couponsMobile.rawModel();
    mockUser.findById.mockResolvedValue({ _id: "u1", phone: "055" });
    CouponMobile.findOne.mockResolvedValue({ _id: "other" });
    const req = makeReq({ body: { name: "A", phone: "055" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.createCoupon(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Phone already exists" }));
  });
  it("201 on successful coupon creation", async () => {
    const repositories = require("../../../src/repositories");
    const CouponMobile = repositories.couponsMobile.rawModel();
    const sendEmail = require("../../../src/mail/emailService").sendEmail;
    mockUser.findById.mockResolvedValue({ _id: "u1", phone: "055" });
    // first findOne: check duplicate phone → null (no duplicate)
    // second findOne().sort().exec() → lastCoupon: null
    const chainNull = { sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) };
    CouponMobile.findOne
      .mockResolvedValueOnce(null)   // no duplicate
      .mockReturnValueOnce(chainNull); // lastCoupon chain
    CouponMobile.find.mockResolvedValue([]); // generateCouponCode
    sendEmail.mockResolvedValue(undefined);
    const req = makeReq({ body: { name: "Ali", phone: "055" }, user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.createCoupon(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ── checkCouponCode — FIRST15 via phone lookup ──────────────────
describe("checkCouponCode FIRST15 phone lookup", () => {
  it("looks up user by phone when not authenticated and coupon=FIRST15", async () => {
    mockUser.findOne = jest.fn().mockResolvedValue({ usedFirst15Coupon: false });
    const req = { ...makeReq({ body: { couponCode: "FIRST15", phone: "055" } }), user: null };
    req.header = jest.fn().mockReturnValue(undefined);
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("400 when neither user nor phone provided for FIRST15", async () => {
    const req = { ...makeReq({ body: { couponCode: "FIRST15" } }), user: null };
    req.header = jest.fn().mockReturnValue(undefined);
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── checkCouponCode — UAE10 path ──────────────────────────────────
describe("checkCouponCode UAE10", () => {
  beforeEach(() => jest.clearAllMocks());

  it("404 when coupon details not found from API", async () => {
    axios.get.mockResolvedValue({ data: {} }); // no data.data
    const req = makeReq({ body: { couponCode: "UAE10" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("400 when promotion not active", async () => {
    axios.get.mockResolvedValue({
      data: { data: { status: "inactive", start_time: new Date().toISOString(), end_time: new Date().toISOString() } }
    });
    const req = makeReq({ body: { couponCode: "UAE10" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "This promotion is not active." }));
  });

  it("400 when promotion not started yet", async () => {
    const future = new Date(Date.now() + 86400000);
    axios.get.mockResolvedValue({
      data: { data: { status: "active", start_time: future.toISOString(), end_time: new Date(Date.now() + 172800000).toISOString() } }
    });
    const req = makeReq({ body: { couponCode: "UAE10" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Promotion has not started yet." }));
  });

  it("400 when promotion expired", async () => {
    const past = new Date(Date.now() - 86400000);
    axios.get.mockResolvedValue({
      data: { data: { status: "active", start_time: new Date(Date.now() - 172800000).toISOString(), end_time: past.toISOString() } }
    });
    const req = makeReq({ body: { couponCode: "UAE10" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Promotion has expired." }));
  });

  it("200 when UAE10 coupon is valid and active", async () => {
    const now = Date.now();
    axios.get.mockResolvedValue({
      data: { data: { status: "active", start_time: new Date(now - 3600000).toISOString(), end_time: new Date(now + 3600000).toISOString() } }
    });
    const req = makeReq({ body: { couponCode: "UAE10" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("404 when axios throws (fetchCouponDetails returns null)", async () => {
    axios.get.mockRejectedValue(new Error("network error"));
    const req = makeReq({ body: { couponCode: "UAE10" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── checkCouponCode — generic coupon path ────────────────────────
describe("checkCouponCode generic", () => {
  it("200 when coupon found", async () => {
    const repositories = require("../../../src/repositories");
    const CouponMobile = repositories.couponsMobile.rawModel();
    CouponMobile.findOne.mockResolvedValue({ coupon: "DH1YHZXB", status: "unused" });
    const req = makeReq({ body: { couponCode: "DH1YHZXB", phone: "055" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("404 when coupon not found", async () => {
    const repositories = require("../../../src/repositories");
    const CouponMobile = repositories.couponsMobile.rawModel();
    CouponMobile.findOne.mockResolvedValue(null);
    const req = makeReq({ body: { couponCode: "INVALID", phone: "055" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
  it("500 on db error", async () => {
    const repositories = require("../../../src/repositories");
    const CouponMobile = repositories.couponsMobile.rawModel();
    CouponMobile.findOne.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: { couponCode: "DH1YHZXB", phone: "055" } });
    const res = makeRes();
    await ctrl.checkCouponCode(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── appleCallback ─────────────────────────────────────────────────
describe("appleCallback", () => {
  it("200 with customerId", async () => {
    mockUser.findById.mockResolvedValue({ _id: "u1", customerId: "cust1" });
    const req = makeReq({ user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.appleCallback(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust1" }));
  });
  it("404 when user not found", async () => {
    mockUser.findById.mockResolvedValue(null);
    const req = makeReq({ user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.appleCallback(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on error", async () => {
    mockUser.findById.mockRejectedValue(new Error("db"));
    const req = makeReq({ user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.appleCallback(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
