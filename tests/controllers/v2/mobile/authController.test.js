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
  refreshToken: jest.fn(),
  checkAccessToken: jest.fn(),
  updateProfile: jest.fn(),
  deleteAccount: jest.fn(),
  verifyRecoveryCode: jest.fn(),
  resendRecoveryCode: jest.fn(),
  updatePassword: jest.fn(),
}));
jest.mock("../../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const authService = require("../../../../src/services/authService");
const ctrl = require("../../../../src/controllers/v2/mobile/authController");
const { runHandler } = require('../../../_helpers/handlerExec');

const makeReq = (opts = {}) => ({
  user: opts.user || { _id: "u1" },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  headers: opts.headers || {},
  header: jest.fn((h) => (opts.headers || {})[h]),
  file: opts.file || null,
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.cookie = jest.fn().mockReturnValue(r);
  return r;
};

const loginResult = () => ({
  tokens: { accessToken: "a_tok", refreshToken: "r_tok" },
  user: { _id: "u1" }, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false,
});

beforeEach(() => jest.clearAllMocks());

describe("register", () => {
  it("201 on new user", async () => {
    authService.register.mockResolvedValue({ restored: false });
    const res = makeRes();
    await ctrl.register(makeReq({ body: { name: "A", email: "a@b.com", password: "pw" } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("200 on restored account", async () => {
    authService.register.mockResolvedValue({ restored: true });
    const res = makeRes();
    await ctrl.register(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.register.mockRejectedValue({ status: 409, message: "exists" });
    const { statusCode } = await runHandler(ctrl.register, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(409);
  });
});

describe("login", () => {
  it("200 on success", async () => {
    authService.loginWithCredentials.mockResolvedValue(loginResult());
    const res = makeRes();
    await ctrl.login(makeReq({ body: { email: "a@b.com", password: "pw" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    authService.loginWithCredentials.mockRejectedValue({ status: 401, message: "wrong" });
    const { statusCode } = await runHandler(ctrl.login, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(401);
  });
});

describe("googleLogin", () => {
  it("200 on success", async () => {
    authService.googleLogin.mockResolvedValue(loginResult());
    const res = makeRes();
    await ctrl.googleLogin(makeReq({ body: { tokenId: "gid" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.googleLogin.mockRejectedValue({ status: 401, message: "bad" });
    const { statusCode } = await runHandler(ctrl.googleLogin, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(401);
  });
});

describe("appleLogin", () => {
  it("200 on success", async () => {
    authService.appleLogin.mockResolvedValue(loginResult());
    const res = makeRes();
    await ctrl.appleLogin(makeReq({ body: { idToken: "aid" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    authService.appleLogin.mockRejectedValue({ status: 401, message: "bad" });
    const { statusCode } = await runHandler(ctrl.appleLogin, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(401);
  });
});

describe("getUserData", () => {
  it("200 on success", async () => {
    authService.getUserData.mockResolvedValue({ data: {}, coupon: null, totalOrderCount: 0, usedFirst15Coupon: false });
    const res = makeRes();
    await ctrl.getUserData(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    authService.getUserData.mockRejectedValue({ status: 404, message: "not found" });
    const { statusCode } = await runHandler(ctrl.getUserData, makeReq(), { path: '/v2/test' });
    expect(statusCode).toBe(404);
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
    const { statusCode } = await runHandler(ctrl.forgotPassword, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(404);
  });
});

describe("verifyCode", () => {
  it("200 on success", async () => {
    authService.verifyCode.mockResolvedValue();
    const res = makeRes();
    await ctrl.verifyCode(makeReq({ body: { email: "a@b.com", code: "123456" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.verifyCode.mockRejectedValue({ status: 400, message: "bad code" });
    const { statusCode } = await runHandler(ctrl.verifyCode, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(400);
  });
});

describe("resetPassword", () => {
  it("200 on success", async () => {
    authService.resetPassword.mockResolvedValue();
    const res = makeRes();
    await ctrl.resetPassword(makeReq({ body: { email: "a@b.com", code: "123", new_password: "pw" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.resetPassword.mockRejectedValue({ status: 400, message: "bad" });
    const { statusCode } = await runHandler(ctrl.resetPassword, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(400);
  });
});

describe("refreshToken", () => {
  it("401 when no token", async () => {
    const req = makeReq();
    req.header = jest.fn().mockReturnValue(undefined);
    const res = makeRes();
    await ctrl.refreshToken(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("200 on success", async () => {
    const req = makeReq();
    req.header = jest.fn().mockReturnValue("r_tok");
    authService.refreshToken.mockResolvedValue({ accessToken: "new_a", refreshToken: "new_r" });
    const res = makeRes();
    await ctrl.refreshToken(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("403 on error", async () => {
    const req = makeReq();
    req.header = jest.fn().mockReturnValue("bad");
    authService.refreshToken.mockRejectedValue(new Error("invalid"));
    const { statusCode } = await runHandler(ctrl.refreshToken, req, { path: '/v2/test' });
    expect(statusCode).toBe(403);
  });
});

describe("checkAccessToken", () => {
  it("401 when no access token", async () => {
    const req = makeReq();
    req.header = jest.fn().mockReturnValue(undefined);
    const res = makeRes();
    await ctrl.checkAccessToken(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it("200 on success", async () => {
    const req = makeReq();
    req.header = jest.fn()
      .mockReturnValueOnce("a_tok")
      .mockReturnValueOnce("r_tok");
    authService.checkAccessToken.mockResolvedValue({ valid: true });
    const res = makeRes();
    await ctrl.checkAccessToken(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    const req = makeReq();
    req.header = jest.fn().mockReturnValue("bad");
    authService.checkAccessToken.mockRejectedValue({ status: 401, message: "expired" });
    const { statusCode } = await runHandler(ctrl.checkAccessToken, req, { path: '/v2/test' });
    expect(statusCode).toBe(401);
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
    const { statusCode } = await runHandler(ctrl.updateProfile, makeReq(), { path: '/v2/test' });
    expect(statusCode).toBe(400);
  });
});

describe("deleteAccount", () => {
  it("200 on success", async () => {
    authService.deleteAccount.mockResolvedValue();
    const res = makeRes();
    await ctrl.deleteAccount(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.deleteAccount.mockRejectedValue({ status: 404, message: "not found" });
    const { statusCode } = await runHandler(ctrl.deleteAccount, makeReq(), { path: '/v2/test' });
    expect(statusCode).toBe(404);
  });
});

describe("verifyRecoveryCode", () => {
  it("200 on success", async () => {
    authService.verifyRecoveryCode.mockResolvedValue();
    const res = makeRes();
    await ctrl.verifyRecoveryCode(makeReq({ body: { email: "a@b.com", recoveryCode: "rc", newPassword: "np" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.verifyRecoveryCode.mockRejectedValue({ status: 400, message: "bad code" });
    const { statusCode } = await runHandler(ctrl.verifyRecoveryCode, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(400);
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
    const { statusCode } = await runHandler(ctrl.resendRecoveryCode, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(429);
  });
});

describe("updatePassword", () => {
  it("200 on success", async () => {
    authService.updatePassword.mockResolvedValue();
    const res = makeRes();
    await ctrl.updatePassword(makeReq({ body: { old_password: "old", new_password: "new" }, user: { _id: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes error", async () => {
    authService.updatePassword.mockRejectedValue({ status: 400, message: "wrong old" });
    const { statusCode } = await runHandler(ctrl.updatePassword, makeReq({ body: {} }), { path: '/v2/test' });
    expect(statusCode).toBe(400);
  });
});
