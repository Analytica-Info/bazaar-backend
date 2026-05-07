jest.mock("../../../src/services/bannerService");

const bannerService = require("../../../src/services/bannerService");
const ctrl = require("../../../src/controllers/shared/bannerImageController");

const makeReq = (opts = {}) => ({
  params: opts.params || {},
  body: opts.body || {},
  file: opts.file || null,
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("createBanner", () => {
  it("400 when name missing", async () => {
    const req = makeReq({ body: {}, file: { path: "uploads/img.png" } });
    const res = makeRes();
    await ctrl.createBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Banner name is required" }));
  });
  it("400 when file missing", async () => {
    const req = makeReq({ body: { name: "Banner1" }, file: null });
    const res = makeRes();
    await ctrl.createBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Banner image is required" }));
  });
  it("201 on success", async () => {
    bannerService.createBanner.mockResolvedValue({ _id: "b1", name: "Banner1" });
    const req = makeReq({ body: { name: "Banner1" }, file: { path: "uploads/img.png" } });
    const res = makeRes();
    await ctrl.createBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Banner created successfully" }));
  });
  it("passes status error", async () => {
    bannerService.createBanner.mockRejectedValue({ status: 409, message: "already exists" });
    const req = makeReq({ body: { name: "X" }, file: { path: "uploads/img.png" } });
    const res = makeRes();
    await ctrl.createBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    bannerService.createBanner.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: { name: "X" }, file: { path: "uploads/img.png" } });
    const res = makeRes();
    await ctrl.createBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getAllBanners", () => {
  it("200 on success", async () => {
    bannerService.getAllBanners.mockResolvedValue([{ _id: "b1" }]);
    const req = makeReq();
    const res = makeRes();
    await ctrl.getAllBanners(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ banners: expect.any(Array) }));
  });
  it("500 on error", async () => {
    bannerService.getAllBanners.mockRejectedValue(new Error("db"));
    const req = makeReq();
    const res = makeRes();
    await ctrl.getAllBanners(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("updateBanner", () => {
  it("200 on success without file", async () => {
    bannerService.updateBanner.mockResolvedValue({ _id: "b1", name: "Updated" });
    const req = makeReq({ params: { id: "b1" }, body: { name: "Updated" } });
    const res = makeRes();
    await ctrl.updateBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bannerService.updateBanner).toHaveBeenCalledWith("b1", "Updated", null);
  });
  it("200 on success with file", async () => {
    bannerService.updateBanner.mockResolvedValue({ _id: "b1", name: "Updated" });
    const req = makeReq({ params: { id: "b1" }, body: { name: "Updated" }, file: { path: "uploads/new.png" } });
    const res = makeRes();
    await ctrl.updateBanner(req, res);
    expect(bannerService.updateBanner).toHaveBeenCalledWith("b1", "Updated", "uploads/new.png");
  });
  it("passes status error", async () => {
    bannerService.updateBanner.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { id: "bad" }, body: {} });
    const res = makeRes();
    await ctrl.updateBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    bannerService.updateBanner.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { id: "b1" }, body: {} });
    const res = makeRes();
    await ctrl.updateBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("deleteBanner", () => {
  it("200 on success", async () => {
    bannerService.deleteBanner.mockResolvedValue();
    const req = makeReq({ params: { id: "b1" } });
    const res = makeRes();
    await ctrl.deleteBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Banner deleted successfully" }));
  });
  it("passes status error", async () => {
    bannerService.deleteBanner.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { id: "bad" } });
    const res = makeRes();
    await ctrl.deleteBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    bannerService.deleteBanner.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { id: "b1" } });
    const res = makeRes();
    await ctrl.deleteBanner(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
