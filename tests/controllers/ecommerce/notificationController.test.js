jest.mock("../../../src/services/notificationService");
jest.mock("jsonwebtoken");
jest.mock("../../../src/config/jwtSecret", () => "test_secret");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const notificationService = require("../../../src/services/notificationService");
const jwt = require("jsonwebtoken");
const ctrl = require("../../../src/controllers/ecommerce/notificationController");

const makeReq = (opts = {}) => ({
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  header: jest.fn((h) => (opts.headers || {})[h]),
  headers: opts.headers || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── createNotification ────────────────────────────────────────────
describe("createNotification", () => {
  it("201 on success with adminId from token", async () => {
    jwt.verify.mockReturnValue({ id: "admin1" });
    notificationService.createNotification.mockResolvedValue({ _id: "n1" });
    const req = makeReq({
      body: { title: "T", message: "M", sendToAll: true },
      headers: { Authorization: "Bearer valid_token" },
    });
    const res = makeRes();
    await ctrl.createNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("201 without token (no adminId)", async () => {
    notificationService.createNotification.mockResolvedValue({ _id: "n1" });
    const req = makeReq({ body: { title: "T", message: "M" } });
    const res = makeRes();
    await ctrl.createNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("sendInstantly true string parsed correctly", async () => {
    notificationService.createNotification.mockResolvedValue({ _id: "n1" });
    const req = makeReq({ body: { title: "T", message: "M", sendInstantly: "true" } });
    const res = makeRes();
    await ctrl.createNotification(req, res);
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({ sendInstantly: true }));
  });
  it("passes status error", async () => {
    notificationService.createNotification.mockRejectedValue({ status: 400, message: "bad" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    notificationService.createNotification.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getNotifications ──────────────────────────────────────────────
describe("getNotifications", () => {
  it("200 on success with pagination defaults", async () => {
    notificationService.getNotifications.mockResolvedValue({ notifications: [], pagination: { page: 1, total: 0 } });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getNotifications(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(notificationService.getNotifications).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });
  it("uses query params", async () => {
    notificationService.getNotifications.mockResolvedValue({ notifications: [], pagination: {} });
    const req = makeReq({ query: { page: "3", limit: "5" } });
    const res = makeRes();
    await ctrl.getNotifications(req, res);
    expect(notificationService.getNotifications).toHaveBeenCalledWith({ page: 3, limit: 5 });
  });
  it("500 on error", async () => {
    notificationService.getNotifications.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getNotifications(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getNotificationDetails ────────────────────────────────────────
describe("getNotificationDetails", () => {
  it("200 on success", async () => {
    notificationService.getNotificationDetails.mockResolvedValue({ _id: "n1", title: "T" });
    const req = makeReq({ params: { notificationId: "n1" } });
    const res = makeRes();
    await ctrl.getNotificationDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    notificationService.getNotificationDetails.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { notificationId: "bad" } });
    const res = makeRes();
    await ctrl.getNotificationDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    notificationService.getNotificationDetails.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { notificationId: "n1" } });
    const res = makeRes();
    await ctrl.getNotificationDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updateNotification ────────────────────────────────────────────
describe("updateNotification", () => {
  it("200 on success", async () => {
    notificationService.updateNotification.mockResolvedValue({ _id: "n1" });
    const req = makeReq({ params: { notificationId: "n1" }, body: { title: "New T" } });
    const res = makeRes();
    await ctrl.updateNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    notificationService.updateNotification.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { notificationId: "bad" }, body: {} });
    const res = makeRes();
    await ctrl.updateNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    notificationService.updateNotification.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { notificationId: "n1" }, body: {} });
    const res = makeRes();
    await ctrl.updateNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── searchUsers ───────────────────────────────────────────────────
describe("searchUsers", () => {
  it("200 on success with defaults", async () => {
    notificationService.searchUsers.mockResolvedValue({ users: [], pagination: {} });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.searchUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(notificationService.searchUsers).toHaveBeenCalledWith({ search: "", page: 1, limit: 20 });
  });
  it("500 on error", async () => {
    notificationService.searchUsers.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.searchUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── deleteNotification ────────────────────────────────────────────
describe("deleteNotification", () => {
  it("200 on success", async () => {
    notificationService.deleteNotification.mockResolvedValue();
    const req = makeReq({ params: { notificationId: "n1" } });
    const res = makeRes();
    await ctrl.deleteNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    notificationService.deleteNotification.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { notificationId: "bad" } });
    const res = makeRes();
    await ctrl.deleteNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    notificationService.deleteNotification.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { notificationId: "n1" } });
    const res = makeRes();
    await ctrl.deleteNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getAllUsersForNotification ─────────────────────────────────────
describe("getAllUsersForNotification", () => {
  it("200 on success", async () => {
    notificationService.getAllUsersForNotification.mockResolvedValue([{ _id: "u1" }]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getAllUsersForNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    notificationService.getAllUsersForNotification.mockRejectedValue(new Error("db"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getAllUsersForNotification(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
