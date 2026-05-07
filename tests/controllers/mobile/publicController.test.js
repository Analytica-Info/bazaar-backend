jest.mock("../../../src/services/contactService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const contactService = require("../../../src/services/contactService");
const ctrl = require("../../../src/controllers/mobile/publicController");

const makeReq = (opts = {}) => ({
  user: opts.user || null,
  body: opts.body || {},
  query: opts.query || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.download = jest.fn((path, cb) => cb && cb(null));
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("contactUs", () => {
  it("200 on success", async () => {
    contactService.submitContactForm.mockResolvedValue("Thank you for contacting us");
    const req = makeReq({ body: { email: "a@b.com", name: "A", subject: "Hello", message: "Hi" } });
    const res = makeRes();
    await ctrl.contactUs(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Thank you for contacting us" }));
  });
  it("passes status error", async () => {
    contactService.submitContactForm.mockRejectedValue({ status: 400, message: "invalid email" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.contactUs(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    contactService.submitContactForm.mockRejectedValue(new Error("email server"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.contactUs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("submitFeedback", () => {
  it("200 on success", async () => {
    contactService.submitFeedback.mockResolvedValue("Feedback submitted");
    const req = makeReq({ body: { name: "A", feedback: "Good!" }, user: { email: "a@b.com" } });
    const res = makeRes();
    await ctrl.submitFeedback(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    contactService.submitFeedback.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.submitFeedback(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    contactService.submitFeedback.mockRejectedValue(new Error("email"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.submitFeedback(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("createMobileAppLog", () => {
  it("200 on success", async () => {
    contactService.createMobileAppLog.mockResolvedValue({ logId: "log1" });
    const req = makeReq({ body: { user_name: "A", mobile_device: "iPhone", activity_name: "test" } });
    const res = makeRes();
    await ctrl.createMobileAppLog(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, log_id: "log1" }));
  });
  it("passes status error", async () => {
    contactService.createMobileAppLog.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createMobileAppLog(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    contactService.createMobileAppLog.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createMobileAppLog(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("downloadFile", () => {
  it("downloads file on success", async () => {
    contactService.downloadFile.mockReturnValue("/full/path/to/file.pdf");
    const req = makeReq({ query: { url: "uploads/file.pdf" } });
    const res = makeRes();
    await ctrl.downloadFile(req, res);
    expect(res.download).toHaveBeenCalledWith("/full/path/to/file.pdf", expect.any(Function));
  });
  it("passes status error", async () => {
    contactService.downloadFile.mockImplementation(() => { throw { status: 404, message: "not found" }; });
    const req = makeReq({ query: { url: "bad" } });
    const res = makeRes();
    await ctrl.downloadFile(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on download error callback", async () => {
    contactService.downloadFile.mockReturnValue("/path/file.pdf");
    const req = makeReq({ query: { url: "uploads/file.pdf" } });
    const res = makeRes();
    res.download = jest.fn((path, cb) => cb && cb(new Error("disk error")));
    await ctrl.downloadFile(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
