jest.mock("../../../src/services/notificationService");
jest.mock("../../../src/utilities/logger", () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const notificationService = require("../../../src/services/notificationService");
const ctrl = require("../../../src/controllers/mobile/notificationController");

const makeReq = (opts = {}) => ({
  user: { _id: "u1", ...opts.user },
  body: opts.body || {},
});
const makeRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

describe("getNotification", () => {
  it("200 on success", async () => {
    notificationService.getUserNotifications.mockResolvedValue({
      notificationsCount: 3, unreadCount: 1, notifications: []
    });
    const res = makeRes();
    await ctrl.getNotification(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, unreadCount: 1 }));
  });
  it("500 on error", async () => {
    notificationService.getUserNotifications.mockRejectedValue(new Error("db"));
    const res = makeRes();
    await ctrl.getNotification(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("markNotificationsAsRead", () => {
  it("200 on success", async () => {
    notificationService.markNotificationsAsRead.mockResolvedValue();
    const req = makeReq({ body: { ids: ["n1", "n2"] } });
    const res = makeRes();
    await ctrl.markNotificationsAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    notificationService.markNotificationsAsRead.mockRejectedValue({ status: 400, message: "bad ids" });
    const req = makeReq({ body: { ids: [] } });
    const res = makeRes();
    await ctrl.markNotificationsAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("500 on unknown error", async () => {
    notificationService.markNotificationsAsRead.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: { ids: ["n1"] } });
    const res = makeRes();
    await ctrl.markNotificationsAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("trackNotificationClick", () => {
  it("200 on success", async () => {
    notificationService.trackNotificationClick.mockResolvedValue();
    const req = makeReq({ body: { notificationId: "n1" } });
    const res = makeRes();
    await ctrl.trackNotificationClick(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("passes status error", async () => {
    notificationService.trackNotificationClick.mockRejectedValue({ status: 404, message: "not found" });
    const req = makeReq({ body: { notificationId: "bad" } });
    const res = makeRes();
    await ctrl.trackNotificationClick(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it("500 on unknown error", async () => {
    notificationService.trackNotificationClick.mockRejectedValue(new Error("db"));
    const req = makeReq({ body: {} });
    const res = makeRes();
    await ctrl.trackNotificationClick(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
