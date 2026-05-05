jest.mock("../../../src/services/shippingService");

const shippingService = require("../../../src/services/shippingService");
const ctrl = require("../../../src/controllers/ecommerce/shippingCountryController");

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

// ADMIN CRUD matrix
describe.each([
  ["list", "listCountries", null, null, 200],
  ["create", "createCountry", null, { name: "UAE" }, 201],
  ["getById", "getCountryById", { id: "c1" }, null, 200],
  ["update", "updateCountry", { id: "c1" }, { name: "UAE2" }, 200],
  ["remove", "deleteCountry", { id: "c1" }, null, 200],
])("%s", (ctrlMethod, svcMethod, params, body, successStatus) => {
  it(`${successStatus} on success`, async () => {
    shippingService[svcMethod].mockResolvedValue({ _id: "c1" });
    const req = makeReq({ params: params || {}, body: body || {} });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(successStatus);
  });
  it("passes status error", async () => {
    shippingService[svcMethod].mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: params || {}, body: body || {} });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    shippingService[svcMethod].mockRejectedValue(new Error("db"));
    const req = makeReq({ params: params || {}, body: body || {} });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── toggleActive ──────────────────────────────────────────────────
describe("toggleActive", () => {
  it("200 active country", async () => {
    shippingService.toggleCountryActive.mockResolvedValue({ _id: "c1", isActive: true });
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await ctrl.toggleActive(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Country activated." }));
  });
  it("200 deactivated country", async () => {
    shippingService.toggleCountryActive.mockResolvedValue({ _id: "c1", isActive: false });
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await ctrl.toggleActive(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Country deactivated." }));
  });
  it("500 on error", async () => {
    shippingService.toggleCountryActive.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await ctrl.toggleActive(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── bulkImportCities ──────────────────────────────────────────────
describe("bulkImportCities", () => {
  it("200 on success", async () => {
    shippingService.bulkImportCities.mockResolvedValue({ added: 5, skipped: 1 });
    const req = makeReq({ params: { id: "c1" }, body: { cities: [] } });
    const res = makeRes();
    await ctrl.bulkImportCities(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    shippingService.bulkImportCities.mockRejectedValue(new Error("db"));
    const req = makeReq({ params: { id: "c1" }, body: { cities: [] } });
    const res = makeRes();
    await ctrl.bulkImportCities(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── bulkImportAreas ───────────────────────────────────────────────
describe("bulkImportAreas", () => {
  it("200 on success", async () => {
    shippingService.bulkImportAreas.mockResolvedValue({ added: 3, skipped: 0 });
    const req = makeReq({ params: { id: "c1", cityId: "ci1" }, body: { areas: [] } });
    const res = makeRes();
    await ctrl.bulkImportAreas(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// City CRUD
describe.each([
  ["addCity", "addCity", { id: "c1" }, { name: "Dubai" }, 201],
  ["updateCity", "updateCity", { id: "c1", cityId: "ci1" }, { name: "Abu" }, 200],
  ["removeCity", "removeCity", { id: "c1", cityId: "ci1" }, null, 200],
])("%s", (ctrlMethod, svcMethod, params, body, successStatus) => {
  it(`${successStatus} on success`, async () => {
    shippingService[svcMethod].mockResolvedValue({ _id: "c1" });
    const req = makeReq({ params, body: body || {} });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(successStatus);
  });
  it("500 on error", async () => {
    shippingService[svcMethod].mockRejectedValue(new Error("db"));
    const req = makeReq({ params, body: body || {} });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// Area CRUD
describe.each([
  ["addArea", "addArea", { id: "c1", cityId: "ci1" }, { name: "Marina" }, 201],
  ["updateArea", "updateArea", { id: "c1", cityId: "ci1", areaId: "a1" }, {}, 200],
  ["removeArea", "removeArea", { id: "c1", cityId: "ci1", areaId: "a1" }, null, 200],
])("%s", (ctrlMethod, svcMethod, params, body, successStatus) => {
  it(`${successStatus} on success`, async () => {
    shippingService[svcMethod].mockResolvedValue({ _id: "c1" });
    const req = makeReq({ params, body: body || {} });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(successStatus);
  });
  it("500 on error", async () => {
    shippingService[svcMethod].mockRejectedValue(new Error("db"));
    const req = makeReq({ params, body: body || {} });
    const res = makeRes();
    await ctrl[ctrlMethod](req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── PUBLIC endpoints ───────────────────────────────────────────────
describe("listActive", () => {
  it("200 on success", async () => {
    shippingService.listActiveCountries.mockResolvedValue([]);
    const req = makeReq();
    const res = makeRes();
    await ctrl.listActive(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("500 on error", async () => {
    shippingService.listActiveCountries.mockRejectedValue(new Error("db"));
    const req = makeReq();
    const res = makeRes();
    await ctrl.listActive(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getCities", () => {
  it("200 on success", async () => {
    shippingService.getCitiesForCountry.mockResolvedValue({ cities: [] });
    const req = makeReq({ params: { code: "AE" } });
    const res = makeRes();
    await ctrl.getCities(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    shippingService.getCitiesForCountry.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ params: { code: "XX" } });
    const res = makeRes();
    await ctrl.getCities(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("getShippingCost", () => {
  it("200 on success", async () => {
    shippingService.calculateShippingCost.mockResolvedValue({ shippingCost: 10 });
    const req = makeReq({ query: { country: "AE", city: "Dubai", area: "Marina", subtotal: "100" } });
    const res = makeRes();
    await ctrl.getShippingCost(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    shippingService.calculateShippingCost.mockRejectedValue({ status: 400, message: "not supported" });
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getShippingCost(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    shippingService.calculateShippingCost.mockRejectedValue(new Error("db"));
    const req = makeReq({ query: {} });
    const res = makeRes();
    await ctrl.getShippingCost(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
