require("../setup");
const mongoose = require("mongoose");
const Notification = require("../../src/models/Notification");
const Admin = require("../../src/models/Admin");
const repos = require("../../src/repositories");

describe("NotificationRepository — pagination edges", () => {
  let admin;

  beforeEach(async () => {
    admin = await Admin.create({
      firstName: "P",
      lastName: "A",
      phone: "2",
      email: `pagadmin${Date.now()}@x.com`,
      password: "pw",
    });
  });

  test("listAdminNotificationsPaginated with page 2 returns second slice", async () => {
    for (let i = 0; i < 5; i++) {
      await Notification.create({ title: `notif-${i}`, message: "m", createdBy: admin._id });
    }
    const { items, total } = await repos.notifications.listAdminNotificationsPaginated({ page: 2, limit: 2 });
    expect(total).toBe(5);
    expect(items).toHaveLength(2);
  });

  test("listAdminNotificationsPaginated page beyond total returns empty items", async () => {
    await Notification.create({ title: "one", message: "m", createdBy: admin._id });
    const { items, total } = await repos.notifications.listAdminNotificationsPaginated({ page: 100, limit: 10 });
    expect(total).toBe(1);
    expect(items).toHaveLength(0);
  });

  test("listAdminNotificationsPaginated excludes notifications without createdBy", async () => {
    const userId = new mongoose.Types.ObjectId();
    await Notification.create({ title: "user-notif", message: "m", userId });
    await Notification.create({ title: "admin-notif", message: "m", createdBy: admin._id });

    const { items, total } = await repos.notifications.listAdminNotificationsPaginated({ page: 1, limit: 10 });
    expect(total).toBe(1);
    expect(items[0].title).toBe("admin-notif");
  });

  test("listForUser paginate page 2 returns correct slice", async () => {
    const userId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 6; i++) {
      await Notification.create({ title: `u-${i}`, message: "m", userId, read: false });
    }
    const { items, total } = await repos.notifications.listForUser(userId, {
      paginate: true,
      page: 2,
      limit: 3,
    });
    expect(total).toBe(6);
    expect(items).toHaveLength(3);
  });

  test("listForUser paginate: false returns all regardless of page/limit", async () => {
    const userId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 4; i++) {
      await Notification.create({ title: `t-${i}`, message: "m", userId });
    }
    const { items, total } = await repos.notifications.listForUser(userId, {
      paginate: false,
      page: 1,
      limit: 1,
    });
    expect(total).toBe(4);
    expect(items).toHaveLength(4);
  });

  test("listForUser for user with no notifications returns zero counts", async () => {
    const { items, total, unreadCount } = await repos.notifications.listForUser(
      new mongoose.Types.ObjectId(),
      { paginate: false }
    );
    expect(total).toBe(0);
    expect(unreadCount).toBe(0);
    expect(items).toHaveLength(0);
  });

  test("findByIdAsDocument returns hydrated doc", async () => {
    const n = await Notification.create({ title: "hydrated", message: "m", createdBy: admin._id });
    const doc = await repos.notifications.findByIdAsDocument(n._id);
    expect(typeof doc.save).toBe("function");
  });

  test("findByIdAsDocument returns null for missing id", async () => {
    const doc = await repos.notifications.findByIdAsDocument(new mongoose.Types.ObjectId());
    expect(doc).toBeNull();
  });
});
