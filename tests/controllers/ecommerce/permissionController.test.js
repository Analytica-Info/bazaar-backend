jest.mock("../../../src/services/permissionService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const permissionService = require("../../../src/services/permissionService");
const ctrl = require("../../../src/controllers/ecommerce/permissionController");

const makeReq = (opts = {}) => ({ params: opts.params || {}, body: opts.body || {} });
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── getAllPermissions ─────────────────────────────────────────────
describe("getAllPermissions", () => {
  it("200 on success", async () => {
    permissionService.getAllPermissions.mockResolvedValue([]);
    const res = makeRes();
    await ctrl.getAllPermissions(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    permissionService.getAllPermissions.mockRejectedValue({ status: 500, message: "db" });
    const res = makeRes();
    await ctrl.getAllPermissions(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it("500 on unknown error", async () => {
    permissionService.getAllPermissions.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getAllPermissions(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getPermissionsByModule ────────────────────────────────────────
describe("getPermissionsByModule", () => {
  it("200 on success", async () => {
    permissionService.getPermissionsByModule.mockResolvedValue({ permissions: {}, allPermissions: [] });
    const res = makeRes();
    await ctrl.getPermissionsByModule(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ permissions: {}, allPermissions: [] }));
  });
  it("500 on error", async () => {
    permissionService.getPermissionsByModule.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getPermissionsByModule(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getPermissionById ─────────────────────────────────────────────
describe("getPermissionById", () => {
  it("200 on success", async () => {
    permissionService.getPermissionById.mockResolvedValue({ _id: "p1" });
    const res = makeRes();
    await ctrl.getPermissionById(makeReq({ params: { permissionId: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    permissionService.getPermissionById.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.getPermissionById(makeReq({ params: { permissionId: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── createPermission ──────────────────────────────────────────────
describe("createPermission", () => {
  it("201 on success", async () => {
    permissionService.createPermission.mockResolvedValue({ _id: "p1" });
    const res = makeRes();
    await ctrl.createPermission(makeReq({ body: { name: "view_orders", slug: "view-orders", module: "orders", action: "read" } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("passes status error", async () => {
    permissionService.createPermission.mockRejectedValue({ status: 409, message: "already exists" });
    const res = makeRes();
    await ctrl.createPermission(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    permissionService.createPermission.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.createPermission(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updatePermission ──────────────────────────────────────────────
describe("updatePermission", () => {
  it("200 on success", async () => {
    permissionService.updatePermission.mockResolvedValue({ _id: "p1" });
    const res = makeRes();
    await ctrl.updatePermission(makeReq({ params: { permissionId: "p1" }, body: { name: "updated" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    permissionService.updatePermission.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.updatePermission(makeReq({ params: { permissionId: "bad" }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    permissionService.updatePermission.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.updatePermission(makeReq({ params: { permissionId: "p1" }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── deletePermission ──────────────────────────────────────────────
describe("deletePermission", () => {
  it("200 on success", async () => {
    permissionService.deletePermission.mockResolvedValue();
    const res = makeRes();
    await ctrl.deletePermission(makeReq({ params: { permissionId: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Permission deleted successfully." }));
  });
  it("passes status error", async () => {
    permissionService.deletePermission.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.deletePermission(makeReq({ params: { permissionId: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    permissionService.deletePermission.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.deletePermission(makeReq({ params: { permissionId: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
