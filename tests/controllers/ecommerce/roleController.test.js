jest.mock("../../../src/services/roleService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const roleService = require("../../../src/services/roleService");
const ctrl = require("../../../src/controllers/ecommerce/roleController");

const makeReq = (opts = {}) => ({
  params: opts.params || {},
  body: opts.body || {},
  query: opts.query || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ── getAllRoles ───────────────────────────────────────────────────
describe("getAllRoles", () => {
  it("200 on success", async () => {
    roleService.getAllRoles.mockResolvedValue([{ name: "admin" }]);
    const req = makeReq();
    const res = makeRes();
    await ctrl.getAllRoles(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, roles: expect.any(Array) }));
  });
  it("passes status error", async () => {
    roleService.getAllRoles.mockRejectedValue({ status: 404, message: "none" });
    const req = makeReq();
    const res = makeRes();
    await ctrl.getAllRoles(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    roleService.getAllRoles.mockRejectedValue(new Error("db"));
    const req = makeReq();
    const res = makeRes();
    await ctrl.getAllRoles(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getRoleById ───────────────────────────────────────────────────
describe("getRoleById", () => {
  it("200 on success", async () => {
    roleService.getRoleById.mockResolvedValue({ _id: "r1", name: "admin" });
    const req = makeReq({ params: { roleId: "r1" } });
    const res = makeRes();
    await ctrl.getRoleById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    roleService.getRoleById.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { roleId: "bad" } });
    const res = makeRes();
    await ctrl.getRoleById(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    roleService.getRoleById.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { roleId: "r1" } });
    const res = makeRes();
    await ctrl.getRoleById(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── createRole ────────────────────────────────────────────────────
describe("createRole", () => {
  it("201 on success", async () => {
    roleService.createRole.mockResolvedValue({ _id: "r1", name: "editor" });
    const req = makeReq({ body: { name: "editor", description: "desc", permissions: [] } });
    const res = makeRes();
    await ctrl.createRole(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error (409 duplicate)", async () => {
    roleService.createRole.mockRejectedValue({ status: 409, message: "already exists" });
    const req = makeReq({ body: { name: "admin" } });
    const res = makeRes();
    await ctrl.createRole(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    roleService.createRole.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.createRole(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updateRole ────────────────────────────────────────────────────
describe("updateRole", () => {
  it("200 on success", async () => {
    roleService.updateRole.mockResolvedValue({ _id: "r1", name: "editor" });
    const req = makeReq({ params: { roleId: "r1" }, body: { name: "editor" } });
    const res = makeRes();
    await ctrl.updateRole(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    roleService.updateRole.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { roleId: "bad" }, body: {} });
    const res = makeRes();
    await ctrl.updateRole(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    roleService.updateRole.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { roleId: "r1" }, body: {} });
    const res = makeRes();
    await ctrl.updateRole(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── deleteRole ────────────────────────────────────────────────────
describe("deleteRole", () => {
  it("200 on success", async () => {
    roleService.deleteRole.mockResolvedValue();
    const req = makeReq({ params: { roleId: "r1" } });
    const res = makeRes();
    await ctrl.deleteRole(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Role deleted successfully." }));
  });
  it("passes status error", async () => {
    roleService.deleteRole.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { roleId: "bad" } });
    const res = makeRes();
    await ctrl.deleteRole(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    roleService.deleteRole.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { roleId: "r1" } });
    const res = makeRes();
    await ctrl.deleteRole(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
