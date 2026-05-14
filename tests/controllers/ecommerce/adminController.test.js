jest.mock("../../../src/services/adminService", () => ({
  getOrders: jest.fn(), getCoupons: jest.fn(), adminRegister: jest.fn(), adminLogin: jest.fn(),
  forgotPassword: jest.fn(), verifyCode: jest.fn(), resetPassword: jest.fn(), updatePassword: jest.fn(),
  getAllUsers: jest.fn(), getUserById: jest.fn(), exportUsers: jest.fn(),
  blockUser: jest.fn(), unblockUser: jest.fn(), deleteUser: jest.fn(), restoreUser: jest.fn(), updateUser: jest.fn(),
  getAllAdmins: jest.fn(), getCurrentAdmin: jest.fn(), getAdminById: jest.fn(),
  createSubAdmin: jest.fn(), updateSubAdmin: jest.fn(), deleteSubAdmin: jest.fn(),
  updateOrderStatus: jest.fn(), getProductAnalytics: jest.fn(), exportProductAnalytics: jest.fn(),
  getProductViewDetails: jest.fn(), getActivityLogs: jest.fn(), getActivityLogById: jest.fn(),
  downloadActivityLogs: jest.fn(), getBackendLogs: jest.fn(), getBackendLogByDate: jest.fn(),
  downloadBackendLogs: jest.fn(),
}));
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
const mockUsersModel = {
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) })
  }),
};
jest.mock("../../../src/repositories", () => ({
  users: { rawModel: () => mockUsersModel },
}));

const adminService = require("../../../src/services/adminService");
const ctrl = require("../../../src/controllers/ecommerce/adminController");

const makeReq = (opts = {}) => ({
  user: { _id: "admin1", ...opts.user },
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
  file: opts.file || null,
  ...opts.extra,
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── orders ──────────────────────────────────────────────────────
describe("orders", () => {
  it("200 with orders", async () => {
    adminService.getOrders.mockResolvedValue({ orders: [{ _id: "o1" }], pagination: { currentPage: 1 } });
    const req = makeReq({ query: { page: "1", limit: "10" } });
    const res = makeRes();
    await ctrl.orders(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, orders: expect.any(Array) }));
  });
  it("200 with empty orders and pagination", async () => {
    adminService.getOrders.mockResolvedValue({ orders: [], pagination: { totalOrders: 0 } });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.orders(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ orders: [] }));
  });
  it("500 on error", async () => {
    adminService.getOrders.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.orders(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── coupons ──────────────────────────────────────────────────────
describe("coupons", () => {
  it("200 with coupons", async () => {
    adminService.getCoupons.mockResolvedValue([{ code: "X" }]);
    const req = makeReq({});
    const res = makeRes();
    await ctrl.coupons(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coupons: expect.any(Array) }));
  });
  it("404 on not found", async () => {
    adminService.getCoupons.mockRejectedValue({ status: 404, message: "No coupons" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.coupons(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    adminService.getCoupons.mockRejectedValue(new Error("fail"));
    const req = makeReq({});
    const res = makeRes();
    await ctrl.coupons(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── adminRegister ────────────────────────────────────────────────
describe("adminRegister", () => {
  it("201 on success", async () => {
    adminService.adminRegister.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", password: "pw" } });
    const res = makeRes();
    await ctrl.adminRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("passes status error", async () => {
    adminService.adminRegister.mockRejectedValue({ status: 409, message: "exists" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.adminRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    adminService.adminRegister.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.adminRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── adminLogin ───────────────────────────────────────────────────
describe("adminLogin", () => {
  it("200 with token", async () => {
    adminService.adminLogin.mockResolvedValue({ admin: { email: "a@b.com" }, token: "tok" });
    const req = makeReq({ body: { email: "a@b.com", password: "pw" } });
    const res = makeRes();
    await ctrl.adminLogin(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: "tok" }));
  });
  it("passes status error", async () => {
    adminService.adminLogin.mockRejectedValue({ status: 401, message: "wrong" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.adminLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── forgotPassword ───────────────────────────────────────────────
describe("forgotPassword", () => {
  it("200 on success", async () => {
    adminService.forgotPassword.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com" } });
    const res = makeRes();
    await ctrl.forgotPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.forgotPassword.mockRejectedValue({ status: 404, message: "no user" });
    const req = makeReq({ body: { email: "x@y.com" } });
    const res = makeRes();
    await ctrl.forgotPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── verifyCode ───────────────────────────────────────────────────
describe("verifyCode", () => {
  it("200 on success", async () => {
    adminService.verifyCode.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", code: "123456" } });
    const res = makeRes();
    await ctrl.verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.verifyCode.mockRejectedValue({ status: 400, message: "bad code" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── resetPassword ────────────────────────────────────────────────
describe("resetPassword", () => {
  it("200 on success", async () => {
    adminService.resetPassword.mockResolvedValue();
    const req = makeReq({ body: { email: "a@b.com", code: "123", newPassword: "pw" } });
    const res = makeRes();
    await ctrl.resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── updatePassword ───────────────────────────────────────────────
describe("updatePassword", () => {
  it("200 on success", async () => {
    adminService.updatePassword.mockResolvedValue();
    const req = makeReq({ body: { oldPassword: "old", newPassword: "new" } });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.updatePassword.mockRejectedValue({ status: 400, message: "wrong pass" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.updatePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── updateOrderStatus ────────────────────────────────────────────
describe("updateOrderStatus", () => {
  it("200 on success", async () => {
    adminService.updateOrderStatus.mockResolvedValue({ _id: "o1", status: "shipped" });
    const req = makeReq({ params: { orderId: "o1" }, body: { status: "shipped" } });
    const res = makeRes();
    await ctrl.updateOrderStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.updateOrderStatus.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { orderId: "bad" }, body: {} });
    const res = makeRes();
    await ctrl.updateOrderStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    adminService.updateOrderStatus.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { orderId: "o1" }, body: {} });
    const res = makeRes();
    await ctrl.updateOrderStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it("accepts file upload path", async () => {
    adminService.updateOrderStatus.mockResolvedValue({ _id: "o1" });
    const req = makeReq({ params: { orderId: "o1" }, body: { status: "delivered" }, file: { path: "/tmp/f.jpg" } });
    const res = makeRes();
    await ctrl.updateOrderStatus(req, res);
    expect(adminService.updateOrderStatus).toHaveBeenCalledWith("o1", "delivered", "/tmp/f.jpg");
  });
});

// ── getAllUsers ──────────────────────────────────────────────────
describe("getAllUsers", () => {
  it("200 with users", async () => {
    adminService.getAllUsers.mockResolvedValue({ users: [{ _id: "u1" }], pagination: { currentPage: 1 } });
    const req = makeReq({ query: { page: "1", limit: "10" } });
    const res = makeRes();
    await ctrl.getAllUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ users: expect.any(Array) }));
  });
  it("200 empty users list", async () => {
    adminService.getAllUsers.mockResolvedValue({ users: [], pagination: { totalUsers: 0 } });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getAllUsers(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ users: [] }));
  });
  it("500 on error", async () => {
    adminService.getAllUsers.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getAllUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── exportUsers ──────────────────────────────────────────────────
describe("exportUsers", () => {
  it("200 on success", async () => {
    adminService.exportUsers.mockResolvedValue([{ _id: "u1" }]);
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.exportUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    adminService.exportUsers.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.exportUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getUserById ──────────────────────────────────────────────────
describe("getUserById", () => {
  it("200 on success", async () => {
    adminService.getUserById.mockResolvedValue({ _id: "u1" });
    const req = makeReq({ params: { userId: "u1" } });
    const res = makeRes();
    await ctrl.getUserById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.getUserById.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { userId: "bad" } });
    const res = makeRes();
    await ctrl.getUserById(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── blockUser / unblockUser / deleteUser / restoreUser ───────────
describe.each([
  ["blockUser", "blockUser", "User blocked successfully."],
  ["unblockUser", "unblockUser", "User unblocked successfully."],
  ["deleteUser", "deleteUser", "User deleted successfully."],
  ["restoreUser", "restoreUser", "User restored successfully."],
])("%s", (ctrlMethod, svcMethod, successMsg) => {
  it("200 on success", async () => {
    adminService[svcMethod].mockResolvedValue({ _id: "u1" });
    const req = makeReq({ params: { userId: "u1" } });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: successMsg }));
  });
  it("passes status error", async () => {
    adminService[svcMethod].mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { userId: "bad" } });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    adminService[svcMethod].mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { userId: "u1" } });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updateUser ───────────────────────────────────────────────────
describe("updateUser", () => {
  it("200 on success", async () => {
    adminService.updateUser.mockResolvedValue({ _id: "u1" });
    const req = makeReq({ params: { userId: "u1" }, body: { name: "Bob" } });
    const res = makeRes();
    await ctrl.updateUser(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── getAllAdmins ─────────────────────────────────────────────────
describe("getAllAdmins", () => {
  it("200 on success", async () => {
    adminService.getAllAdmins.mockResolvedValue({ admins: [], pagination: {} });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getAllAdmins(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("404 on not found", async () => {
    adminService.getAllAdmins.mockRejectedValue({ status: 404, message: "none", data: { pagination: {} } });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getAllAdmins(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    adminService.getAllAdmins.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getAllAdmins(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getCurrentAdmin ──────────────────────────────────────────────
describe("getCurrentAdmin", () => {
  it("200 on success", async () => {
    adminService.getCurrentAdmin.mockResolvedValue({ _id: "admin1" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getCurrentAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.getCurrentAdmin.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({});
    const res = makeRes();
    await ctrl.getCurrentAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── getAdminById ─────────────────────────────────────────────────
describe("getAdminById", () => {
  it("200 on success", async () => {
    adminService.getAdminById.mockResolvedValue({ _id: "admin1" });
    const req = makeReq({ params: { adminId: "admin1" } });
    const res = makeRes();
    await ctrl.getAdminById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── createSubAdmin ───────────────────────────────────────────────
describe("createSubAdmin", () => {
  it("201 on success", async () => {
    adminService.createSubAdmin.mockResolvedValue({ _id: "sub1" });
    const req = makeReq({ body: { email: "sub@b.com" } });
    const res = makeRes();
    await ctrl.createSubAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("passes status error", async () => {
    adminService.createSubAdmin.mockRejectedValue({ status: 409, message: "exists" });
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createSubAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    adminService.createSubAdmin.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createSubAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updateSubAdmin ───────────────────────────────────────────────
describe("updateSubAdmin", () => {
  it("200 on success", async () => {
    adminService.updateSubAdmin.mockResolvedValue({ _id: "sub1" });
    const req = makeReq({ params: { adminId: "sub1" }, body: { name: "X" } });
    const res = makeRes();
    await ctrl.updateSubAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── deleteSubAdmin ───────────────────────────────────────────────
describe("deleteSubAdmin", () => {
  it("200 on success", async () => {
    adminService.deleteSubAdmin.mockResolvedValue();
    const req = makeReq({ params: { adminId: "sub1" } });
    const res = makeRes();
    await ctrl.deleteSubAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.deleteSubAdmin.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { adminId: "bad" } });
    const res = makeRes();
    await ctrl.deleteSubAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    adminService.deleteSubAdmin.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { adminId: "sub1" } });
    const res = makeRes();
    await ctrl.deleteSubAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getProductAnalytics ──────────────────────────────────────────
describe("getProductAnalytics", () => {
  it("200 on success", async () => {
    adminService.getProductAnalytics.mockResolvedValue({ analytics: [], pagination: {} });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getProductAnalytics(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    adminService.getProductAnalytics.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getProductAnalytics(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── exportProductAnalytics ───────────────────────────────────────
describe("exportProductAnalytics", () => {
  it("200 on success", async () => {
    adminService.exportProductAnalytics.mockResolvedValue([]);
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.exportProductAnalytics(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    adminService.exportProductAnalytics.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.exportProductAnalytics(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getProductViewDetails ────────────────────────────────────────
describe("getProductViewDetails", () => {
  it("200 on success", async () => {
    adminService.getProductViewDetails.mockResolvedValue({ product: {}, viewDetails: [], totalViews: 0, uniqueUsers: 0 });
    const req = makeReq({ params: { productId: "p1" } });
    const res = makeRes();
    await ctrl.getProductViewDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    adminService.getProductViewDetails.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { productId: "p1" } });
    const res = makeRes();
    await ctrl.getProductViewDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getActivityLogs ──────────────────────────────────────────────
describe("getActivityLogs", () => {
  it("200 on success", async () => {
    adminService.getActivityLogs.mockResolvedValue({ logs: [], pagination: {} });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getActivityLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    adminService.getActivityLogs.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getActivityLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getActivityLogById ───────────────────────────────────────────
describe("getActivityLogById", () => {
  it("200 on success", async () => {
    adminService.getActivityLogById.mockResolvedValue({ _id: "log1" });
    const req = makeReq({ params: { logId: "log1" } });
    const res = makeRes();
    await ctrl.getActivityLogById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.getActivityLogById.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { logId: "bad" } });
    const res = makeRes();
    await ctrl.getActivityLogById(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    adminService.getActivityLogById.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { logId: "log1" } });
    const res = makeRes();
    await ctrl.getActivityLogById(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getBackendLogs ───────────────────────────────────────────────
describe("getBackendLogs", () => {
  it("200 on success", async () => {
    adminService.getBackendLogs.mockResolvedValue({ logs: [], pagination: {} });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getBackendLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    adminService.getBackendLogs.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getBackendLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getBackendLogByDate ──────────────────────────────────────────
describe("getBackendLogByDate", () => {
  it("200 on success", async () => {
    adminService.getBackendLogByDate.mockResolvedValue({ _id: "log1" });
    const req = makeReq({ params: { date: "2024-01-01", platform: "web" } });
    const res = makeRes();
    await ctrl.getBackendLogByDate(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    adminService.getBackendLogByDate.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { date: "bad", platform: "web" } });
    const res = makeRes();
    await ctrl.getBackendLogByDate(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── downloadBackendLogs ──────────────────────────────────────────
describe("downloadBackendLogs", () => {
  it("sends text content on success", async () => {
    adminService.downloadBackendLogs.mockResolvedValue([{
      date: "2024-01-01", platform: "web", total_activities: 1,
      success_count: 1, failure_count: 0, activities: [{ activity_name: "Test", status: "success", message: "ok", timestamp: new Date() }]
    }]);
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.downloadBackendLogs(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain");
    expect(res.send).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    adminService.downloadBackendLogs.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.downloadBackendLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── downloadActivityLogs ─────────────────────────────────────────
describe("downloadActivityLogs", () => {
  it("sends text content on success", async () => {
    adminService.downloadActivityLogs.mockResolvedValue([{
      platform: "mobile", log_type: "backend_activity", action: "Test", status: "success",
      message: "ok", timestamp: new Date()
    }]);
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.downloadActivityLogs(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain");
    expect(res.send).toHaveBeenCalled();
  });
  it("500 on error", async () => {
    adminService.downloadActivityLogs.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.downloadActivityLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getLiveUsers ─────────────────────────────────────────────────
describe("getLiveUsers", () => {
  it("200 using repository mock", async () => {
    mockUsersModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) })
    });
    const req = makeReq({ query: { minutes: "15" } });
    const res = makeRes();
    await ctrl.getLiveUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    mockUsersModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error("db")) }) })
    });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getLiveUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
