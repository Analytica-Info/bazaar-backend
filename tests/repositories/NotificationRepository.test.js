require("../setup");
const mongoose = require("mongoose");
const Notification = require("../../src/models/Notification");
const Admin = require("../../src/models/Admin");
const repos = require("../../src/repositories");

describe("NotificationRepository", () => {
  let admin;

  beforeEach(async () => {
    admin = await Admin.create({
      firstName: "T",
      lastName: "A",
      phone: "1",
      email: `a${Date.now()}@x.com`,
      password: "pw",
    });
  });

  test("listAdminNotificationsPaginated returns hydrated docs sorted desc", async () => {
    await Notification.create({ title: "first", message: "m", createdBy: admin._id, createdAt: new Date(2020, 0) });
    await Notification.create({ title: "second", message: "m", createdBy: admin._id, createdAt: new Date(2021, 0) });

    const { items, total } = await repos.notifications.listAdminNotificationsPaginated({ page: 1, limit: 10 });
    expect(total).toBe(2);
    expect(items[0].title).toBe("second");
    expect(typeof items[0].toObject).toBe("function"); // hydrated
  });

  test("listForUser without paginate returns all + counts", async () => {
    const userId = new mongoose.Types.ObjectId();
    await Notification.create({ title: "n1", message: "m", userId, read: false });
    await Notification.create({ title: "n2", message: "m", userId, read: true });
    await Notification.create({ title: "n3", message: "m", userId, read: false });

    const { items, total, unreadCount } = await repos.notifications.listForUser(userId, { paginate: false });
    expect(total).toBe(3);
    expect(items).toHaveLength(3);
    expect(unreadCount).toBe(2);
  });

  test("listForUser with paginate caps items but counts the full set", async () => {
    const userId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 5; i++) {
      await Notification.create({ title: `n${i}`, message: "m", userId, read: false });
    }
    const { items, total, unreadCount } = await repos.notifications.listForUser(userId, {
      paginate: true,
      page: 1,
      limit: 2,
    });
    expect(items).toHaveLength(2);
    expect(total).toBe(5);
    expect(unreadCount).toBe(5);
  });

  test("markReadForUser only updates documents owned by that user", async () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    const a = await Notification.create({ title: "x", message: "m", userId: userA, read: false });
    const b = await Notification.create({ title: "y", message: "m", userId: userB, read: false });

    await repos.notifications.markReadForUser(userA, [a._id, b._id]);

    const ar = await Notification.findById(a._id);
    const br = await Notification.findById(b._id);
    expect(ar.read).toBe(true);
    expect(br.read).toBe(false); // not owned, untouched
  });

  test("findByIdWithCreator populates createdBy", async () => {
    const n = await Notification.create({ title: "x", message: "m", createdBy: admin._id });
    const found = await repos.notifications.findByIdWithCreator(n._id);
    expect(found.createdBy.email).toBe(admin.email);
  });
});
