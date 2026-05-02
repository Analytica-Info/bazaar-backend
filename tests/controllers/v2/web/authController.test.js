'use strict';

jest.mock("../../../../src/services/authService", () => ({
  register: jest.fn(),
  loginWithCredentials: jest.fn(),
  googleLogin: jest.fn(),
  appleLogin: jest.fn(),
  getUserData: jest.fn(),
  forgotPassword: jest.fn(),
  verifyCode: jest.fn(),
  resetPassword: jest.fn(),
  updateProfile: jest.fn(),
  deleteAccount: jest.fn(),
  verifyRecoveryCode: jest.fn(),
  resendRecoveryCode: jest.fn(),
  updatePassword: jest.fn(),
}));
jest.mock("../../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../../../src/config/jwtSecret", () => "test_secret");
jest.mock("jsonwebtoken");

const authService = require("../../../../src/services/authService");
const jwt = require("jsonwebtoken");
const ctrl = require("../../../../src/controllers/v2/web/authController");

const makeReq = (opts = {}) => ({
  user: opts.user || { _id: "u1" },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  headers: opts.headers || {},
  cookies: opts.cookies || {},
  header: jest.fn((h) => (opts.headers || {})[h]),
  file: opts.file || null,
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.cookie = jest.fn().mockReturnValue(r);
  r.clearCookie = jest.fn().mockReturnValue(r);
  return r;
};

const loginResult = () => ({
  tokens: { accessToken: "a_tok", refreshToken: "r_tok" },
  cookieMaxAge: 86400000,
  user: { _id: "u1" }, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false,
});

beforeEach(() => jest.clearAllMocks());

describe("register", () => {
  it("201 on new user", async () => {
    authService.register.mockResolvedValue({ restored: false });
    const res = makeRes();
    await ctrl.register(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("200 on restored account", async () => {
    authService.register.mockResolvedValue({ restored: true });
    const res = makeRes();
    await ctrl.register(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.register.mockRejectedValue({ status: 409, message: "exists" });
    const res = makeRes();
    await ctrl.register(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("login", () => {
  it("200 on success — sets cookie", async () => {
    authService.loginWithCredentials.mockResolvedValue(loginResult());
    const res = makeRes();
    await ctrl.login(makeReq({ body: { email: "a@b.com", password: "pw" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith("user_token", "a_tok", expect.any(Object));
  });
  it("uses rememberMe maxAge when provided", async () => {
    authService.loginWithCredentials.mockResolvedValue({ ...loginResult(), cookieMaxAge: undefined });
    const res = makeRes();
    await ctrl.login(makeReq({ body: { email: "a@b.com", password: "pw", rememberMe: true } }), res);
    expect(res.cookie).toHaveBeenCalledWith("user_token", "a_tok", expect.objectContaining({
      maxAge: 30 * 24 * 60 * 60 * 1000,
    }));
  });
  it("passes error", async () => {
    authService.loginWithCredentials.mockRejectedValue({ status: 401, message: "wrong" });
    const res = makeRes();
    await ctrl.login(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("googleLogin", () => {
  it("200 on success — sets cookie", async () => {
    authService.googleLogin.mockResolvedValue(loginResult());
    const res = makeRes();
    await ctrl.googleLogin(makeReq({ body: { tokenId: "gid" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith("user_token", "a_tok", expect.any(Object));
  });
  it("passes error", async () => {
    authService.googleLogin.mockRejectedValue({ status: 401, message: "bad" });
    const res = makeRes();
    await ctrl.googleLogin(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("appleLogin", () => {
  it("200 on success — sets cookie", async () => {
    authService.appleLogin.mockResolvedValue(loginResult());
    const res = makeRes();
    await ctrl.appleLogin(makeReq({ body: { idToken: "aid" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith("user_token", "a_tok", expect.any(Object));
  });
  it("passes error", async () => {
    authService.appleLogin.mockRejectedValue({ status: 401, message: "bad" });
    const res = makeRes();
    await ctrl.appleLogin(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("logout", () => {
  it("200 and clears cookie", async () => {
    const res = makeRes();
    ctrl.logout(makeReq(), res);
    expect(res.clearCookie).toHaveBeenCalledWith("user_token", expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("checkAuth", () => {
  it("returns authenticated=false when no cookie", async () => {
    const req = makeReq({ cookies: {} });
    const res = makeRes();
    ctrl.checkAuth(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { authenticated: false } }));
  });
  it("returns authenticated=true when valid JWT", async () => {
    jwt.verify = jest.fn((token, secret, cb) => cb(null));
    const req = makeReq({ cookies: { user_token: "valid_tok" } });
    const res = makeRes();
    ctrl.checkAuth(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { authenticated: true } }));
  });
  it("returns authenticated=false when JWT invalid", async () => {
    jwt.verify = jest.fn((token, secret, cb) => cb(new Error("invalid")));
    const req = makeReq({ cookies: { user_token: "bad_tok" } });
    const res = makeRes();
    ctrl.checkAuth(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { authenticated: false } }));
  });
});

describe("forgotPassword", () => {
  it("200 on success", async () => {
    authService.forgotPassword.mockResolvedValue();
    const res = makeRes();
    await ctrl.forgotPassword(makeReq({ body: { email: "a@b.com" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.forgotPassword.mockRejectedValue({ status: 404, message: "no user" });
    const res = makeRes();
    await ctrl.forgotPassword(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("verifyCode", () => {
  it("200 on success", async () => {
    authService.verifyCode.mockResolvedValue();
    const res = makeRes();
    await ctrl.verifyCode(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.verifyCode.mockRejectedValue({ status: 400, message: "bad" });
    const res = makeRes();
    await ctrl.verifyCode(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("resetPassword", () => {
  it("200 on success", async () => {
    authService.resetPassword.mockResolvedValue();
    const res = makeRes();
    await ctrl.resetPassword(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.resetPassword.mockRejectedValue({ status: 400, message: "bad" });
    const res = makeRes();
    await ctrl.resetPassword(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("updatePassword", () => {
  it("200 on success", async () => {
    authService.updatePassword.mockResolvedValue();
    const res = makeRes();
    await ctrl.updatePassword(makeReq({ body: {}, user: { _id: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.updatePassword.mockRejectedValue({ status: 400, message: "wrong" });
    const res = makeRes();
    await ctrl.updatePassword(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("getUserData", () => {
  it("200 on success", async () => {
    authService.getUserData.mockResolvedValue({ data: {}, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false });
    const res = makeRes();
    await ctrl.getUserData(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.getUserData.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.getUserData(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("updateProfile", () => {
  it("200 on success without file", async () => {
    authService.updateProfile.mockResolvedValue({ user: { _id: "u1" } });
    const res = makeRes();
    await ctrl.updateProfile(makeReq({ body: { name: "A" }, user: { _id: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("200 on success with file", async () => {
    authService.updateProfile.mockResolvedValue({ user: { _id: "u1" } });
    const res = makeRes();
    const req = makeReq({ body: { name: "A" }, user: { _id: "u1" }, file: { path: "uploads/img.jpg" } });
    await ctrl.updateProfile(req, res);
    expect(authService.updateProfile).toHaveBeenCalledWith("u1", expect.anything(), expect.stringContaining("uploads/img.jpg"));
  });
  it("passes error", async () => {
    authService.updateProfile.mockRejectedValue({ status: 400, message: "bad" });
    const res = makeRes();
    await ctrl.updateProfile(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("deleteAccount", () => {
  it("200 on success and clears cookie", async () => {
    authService.deleteAccount.mockResolvedValue();
    const res = makeRes();
    await ctrl.deleteAccount(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.clearCookie).toHaveBeenCalledWith("user_token", expect.any(Object));
  });
  it("passes error", async () => {
    authService.deleteAccount.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.deleteAccount(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("verifyRecoveryCode", () => {
  it("200 on success", async () => {
    authService.verifyRecoveryCode.mockResolvedValue();
    const res = makeRes();
    await ctrl.verifyRecoveryCode(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.verifyRecoveryCode.mockRejectedValue({ status: 400, message: "bad" });
    const res = makeRes();
    await ctrl.verifyRecoveryCode(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("resendRecoveryCode", () => {
  it("200 on success", async () => {
    authService.resendRecoveryCode.mockResolvedValue({ attemptsUsed: 1, attemptsLeft: 2 });
    const res = makeRes();
    await ctrl.resendRecoveryCode(makeReq({ body: { email: "a@b.com" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.resendRecoveryCode.mockRejectedValue({ status: 429, message: "too many" });
    const res = makeRes();
    await ctrl.resendRecoveryCode(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
