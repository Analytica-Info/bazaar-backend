jest.mock("../../../src/services/emailConfigService", () => ({
  getEmailConfig: jest.fn(),
  updateEmailConfig: jest.fn(),
  syncFromEnv: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const emailConfigService = require("../../../src/services/emailConfigService");
const ctrl = require("../../../src/controllers/ecommerce/emailController");

const makeReq = (opts = {}) => ({ params: opts.params || {}, body: opts.body || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("getEmailConfig", () => {
  it("200 on success", async () => {
    emailConfigService.getEmailConfig.mockResolvedValue({ adminEmail: "a@b.com" });
    const res = makeRes();
    await ctrl.getEmailConfig(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    emailConfigService.getEmailConfig.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.getEmailConfig(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    emailConfigService.getEmailConfig.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getEmailConfig(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("updateEmailConfig", () => {
  it("200 on success", async () => {
    emailConfigService.updateEmailConfig.mockResolvedValue({ adminEmail: "new@b.com" });
    const res = makeRes();
    await ctrl.updateEmailConfig(makeReq({ body: { adminEmail: "new@b.com", ccEmails: [] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: expect.any(String) }));
  });
  it("passes status error", async () => {
    emailConfigService.updateEmailConfig.mockRejectedValue({ status: 400, message: "invalid email" });
    const res = makeRes();
    await ctrl.updateEmailConfig(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    emailConfigService.updateEmailConfig.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.updateEmailConfig(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("syncFromEnv", () => {
  it("200 on success", async () => {
    emailConfigService.syncFromEnv.mockResolvedValue({ adminEmail: "env@b.com" });
    const res = makeRes();
    await ctrl.syncFromEnv(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    emailConfigService.syncFromEnv.mockRejectedValue({ status: 500, message: "env missing" });
    const res = makeRes();
    await ctrl.syncFromEnv(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it("500 on unknown error", async () => {
    emailConfigService.syncFromEnv.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.syncFromEnv(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
