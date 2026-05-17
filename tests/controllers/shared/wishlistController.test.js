jest.mock("../../../src/services/wishlistService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const wishlistService = require("../../../src/services/wishlistService");
const ctrl = require("../../../src/controllers/shared/wishlistController");

const makeReq = (opts = {}) => ({
  user: { _id: "u1", ...opts.user },
  body: opts.body || {},
  params: opts.params || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("getWishlist", () => {
  it("200 on success", async () => {
    wishlistService.getWishlist.mockResolvedValue({ wishlist: [] });
    const res = makeRes();
    await ctrl.getWishlist(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    wishlistService.getWishlist.mockRejectedValue({ status: 404, message: "not found" });
    const res = makeRes();
    await ctrl.getWishlist(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    wishlistService.getWishlist.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getWishlist(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("addToWishlist", () => {
  it("400 when product_id missing", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.addToWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "product_id is required" }));
  });
  it("200 on success", async () => {
    wishlistService.addToWishlist.mockResolvedValue({ wishlist: ["p1"] });
    const req = makeReq({ body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.addToWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("passes status error", async () => {
    wishlistService.addToWishlist.mockRejectedValue({ status: 409, message: "already in wishlist" });
    const req = makeReq({ body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.addToWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("500 on unknown error", async () => {
    wishlistService.addToWishlist.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.addToWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("removeFromWishlist", () => {
  it("400 when product_id missing", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.removeFromWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "product_id is required" }));
  });
  it("200 on success", async () => {
    wishlistService.removeFromWishlist.mockResolvedValue();
    const req = makeReq({ body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.removeFromWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    wishlistService.removeFromWishlist.mockRejectedValue({ status: 404, message: "not in wishlist" });
    const req = makeReq({ body: { product_id: "bad" } });
    const res = makeRes();
    await ctrl.removeFromWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    wishlistService.removeFromWishlist.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: { product_id: "p1" } });
    const res = makeRes();
    await ctrl.removeFromWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
