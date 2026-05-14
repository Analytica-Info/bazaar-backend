require("../setup");
const mongoose = require("mongoose");
const Notification = require("../../src/models/Notification");
const User = require("../../src/models/User");
const Admin = require("../../src/models/Admin");

// Mock external dependencies that require Firebase / network
jest.mock("../../src/helpers/sendPushNotification", () => ({
  sendNotificationToUsers: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/activityLogger", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/backendLogger", () => ({
  logBackendActivity: jest.fn().mockResolvedValue(undefined),
}));

const notificationService = require("../../src/services/notificationService");

describe("notificationService", () => {
  let testUser;
  let testAdmin;

  beforeEach(async () => {
    process.env.JWT_SECRET = "test-secret";

    testAdmin = await Admin.create({
      firstName: "Test",
      lastName: "Admin",
      phone: "1234567890",
      email: "admin@test.com",
      password: "hashedpassword123",
    });

    testUser = await User.create({
      name: "Test User",
      email: "user@test.com",
      phone: "0987654321",
    });
  });

  // ---------------------------------------------------------------------------
  // getUserNotifications
  // ---------------------------------------------------------------------------
  describe("getUserNotifications", () => {
    it("should return empty when no notifications exist", async () => {
      const result = await notificationService.getUserNotifications(testUser._id);

      expect(result.notificationsCount).toBe(0);
      expect(result.unreadCount).toBe(0);
      expect(result.notifications).toEqual([]);
    });

    it("should return notifications for the user", async () => {
      await Notification.create([
        { userId: testUser._id, title: "N1", message: "msg1", read: false },
        { userId: testUser._id, title: "N2", message: "msg2", read: true },
      ]);

      const result = await notificationService.getUserNotifications(testUser._id);

      expect(result.notificationsCount).toBe(2);
      expect(result.notifications).toHaveLength(2);
    });

    it("should count unread notifications correctly", async () => {
      await Notification.create([
        { userId: testUser._id, title: "N1", message: "msg1", read: false },
        { userId: testUser._id, title: "N2", message: "msg2", read: false },
        { userId: testUser._id, title: "N3", message: "msg3", read: true },
      ]);

      const result = await notificationService.getUserNotifications(testUser._id);

      expect(result.unreadCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // markNotificationsAsRead
  // ---------------------------------------------------------------------------
  describe("markNotificationsAsRead", () => {
    it("should throw when ids array is empty", async () => {
      try {
        await notificationService.markNotificationsAsRead(testUser._id, []);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/no notification ids/i);
      }
    });

    it("should mark specified notifications as read", async () => {
      const n1 = await Notification.create({
        userId: testUser._id,
        title: "N1",
        message: "msg1",
        read: false,
      });
      const n2 = await Notification.create({
        userId: testUser._id,
        title: "N2",
        message: "msg2",
        read: false,
      });

      await notificationService.markNotificationsAsRead(testUser._id, [n1._id, n2._id]);

      const updated1 = await Notification.findById(n1._id);
      const updated2 = await Notification.findById(n2._id);
      expect(updated1.read).toBe(true);
      expect(updated2.read).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // trackNotificationClick
  // ---------------------------------------------------------------------------
  describe("trackNotificationClick", () => {
    it("should throw when notificationId is missing", async () => {
      try {
        await notificationService.trackNotificationClick(testUser._id, null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/notification id is required/i);
      }
    });

    it("should throw when notification is not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      try {
        await notificationService.trackNotificationClick(testUser._id, fakeId);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });

    it("should add user to clickedUsers", async () => {
      const notification = await Notification.create({
        title: "Admin Notif",
        message: "Click me",
        sendToAll: true,
        createdBy: testAdmin._id,
        clickedUsers: [],
        targetUsers: [],
      });

      await notificationService.trackNotificationClick(testUser._id, notification._id);

      const updated = await Notification.findById(notification._id);
      const clickedIds = updated.clickedUsers.map((id) => id.toString());
      expect(clickedIds).toContain(testUser._id.toString());
    });
  });

  // ---------------------------------------------------------------------------
  // createNotification
  // ---------------------------------------------------------------------------
  describe("createNotification", () => {
    it("should throw when title or message is missing", async () => {
      try {
        await notificationService.createNotification({
          message: "body",
          sendToAll: true,
          adminId: testAdmin._id,
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/title and message are required/i);
      }
    });

    it("should throw when neither sendToAll nor targetUsers provided", async () => {
      try {
        await notificationService.createNotification({
          title: "Test",
          message: "body",
          sendToAll: false,
          targetUsers: [],
          adminId: testAdmin._id,
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/sendToAll.*targetUsers/i);
      }
    });

    it("should create a notification with sendToAll", async () => {
      const result = await notificationService.createNotification({
        title: "Broadcast",
        message: "Hello everyone",
        sendToAll: true,
        adminId: testAdmin._id,
      });

      expect(result.title).toBe("Broadcast");
      expect(result.message).toBe("Hello everyone");

      const saved = await Notification.findOne({ title: "Broadcast" });
      expect(saved).not.toBeNull();
      expect(saved.sendToAll).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getNotifications
  // ---------------------------------------------------------------------------
  describe("getNotifications", () => {
    it("should return paginated results", async () => {
      // Create 3 admin notifications
      for (let i = 0; i < 3; i++) {
        await Notification.create({
          title: `Notif ${i}`,
          message: `Msg ${i}`,
          createdBy: testAdmin._id,
          sendToAll: true,
        });
      }

      const result = await notificationService.getNotifications({ page: 1, limit: 2 });

      expect(result.notifications).toHaveLength(2);
      expect(result.pagination.totalNotifications).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.currentPage).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteNotification
  // ---------------------------------------------------------------------------
  describe("deleteNotification", () => {
    it("should throw when notification has already been sent", async () => {
      const notification = await Notification.create({
        title: "Sent",
        message: "Already sent",
        createdBy: testAdmin._id,
        sendToAll: true,
        sentAt: new Date(),
      });

      try {
        await notificationService.deleteNotification(notification._id);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already been sent/i);
      }
    });

    it("should delete an unsent notification", async () => {
      const notification = await Notification.create({
        title: "Unsent",
        message: "Not sent yet",
        createdBy: testAdmin._id,
        sendToAll: true,
      });

      await notificationService.deleteNotification(notification._id);

      const found = await Notification.findById(notification._id);
      expect(found).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// getUserNotifications — pagination (v2)
// These tests define the CONTRACT for the future paginated implementation.
// They WILL FAIL until getUserNotifications(userId, { page, limit }) is added.
// ---------------------------------------------------------------------------
describe("getUserNotifications — pagination (v2)", () => {
  let paginationUser;

  // Helper: create N notifications for a user, spaced 1ms apart so sort order
  // is deterministic without relying on wall-clock timing.
  async function createNotificationsForUser(userId, count) {
    const docs = [];
    const base = new Date("2024-01-01T00:00:00.000Z");
    for (let i = 0; i < count; i++) {
      docs.push({
        userId,
        title: `Notif ${i + 1}`,
        message: `Message ${i + 1}`,
        read: i % 2 === 0, // alternating read/unread
        createdAt: new Date(base.getTime() + i * 1000), // 1 s apart
      });
    }
    await Notification.insertMany(docs);
  }

  beforeEach(async () => {
    const User = require("../../src/models/User");
    paginationUser = await User.create({
      name: "Pagination User",
      email: "pagination@test.com",
      phone: "1111111111",
    });
    await createNotificationsForUser(paginationUser._id, 5);
  });

  it("page=1, limit=2 with 5 notifications returns exactly 2 notifications", async () => {
    const result = await notificationService.getUserNotifications(
      paginationUser._id,
      { page: 1, limit: 2 }
    );
    expect(result.notifications).toHaveLength(2);
  });

  it("page=2, limit=2 with 5 notifications returns the next 2 notifications", async () => {
    const result = await notificationService.getUserNotifications(
      paginationUser._id,
      { page: 2, limit: 2 }
    );
    expect(result.notifications).toHaveLength(2);
  });

  it("page=3, limit=2 with 5 notifications returns the remaining 1 notification", async () => {
    const result = await notificationService.getUserNotifications(
      paginationUser._id,
      { page: 3, limit: 2 }
    );
    expect(result.notifications).toHaveLength(1);
  });

  it("result includes notificationsCount (total, not page count) and unreadCount", async () => {
    const result = await notificationService.getUserNotifications(
      paginationUser._id,
      { page: 1, limit: 2 }
    );
    // Total across ALL pages, not just the current page
    expect(result.notificationsCount).toBe(5);
    // 5 notifications: indices 0,2,4 are read=true → 2 unread (indices 1,3)
    expect(result.unreadCount).toBe(2);
  });

  it("notifications are sorted newest first (descending createdAt)", async () => {
    const result = await notificationService.getUserNotifications(
      paginationUser._id,
      { page: 1, limit: 5 }
    );
    const dates = result.notifications.map((n) => new Date(n.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it("calling without page/limit still returns notifications (backward compat)", async () => {
    const result = await notificationService.getUserNotifications(paginationUser._id);
    expect(result).toHaveProperty("notifications");
    expect(Array.isArray(result.notifications)).toBe(true);
    expect(result.notifications.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getNotificationDetails
// ---------------------------------------------------------------------------
describe("notificationService.getNotificationDetails", () => {
  let adminId;
  let userId;

  beforeEach(async () => {
    const admin = await Admin.create({
      firstName: "Det",
      lastName: "Admin",
      phone: "5550000001",
      email: `det-admin-${Date.now()}@test.com`,
      password: "hashed",
    });
    adminId = admin._id;

    const user = await User.create({
      name: "Detail User",
      email: `det-user-${Date.now()}@test.com`,
      phone: "5550000002",
      password: "hashed",
    });
    userId = user._id;
  });

  it("should throw 404 for non-existent notification", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    try {
      await notificationService.getNotificationDetails(fakeId);
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/not found/i);
    }
  });

  it("should return details for a sendToAll notification", async () => {
    const notif = await Notification.create({
      title: "All Users",
      message: "Broadcast",
      sendToAll: true,
      targetUsers: [],
      clickedUsers: [],
      createdBy: adminId,
    });

    const result = await notificationService.getNotificationDetails(notif._id.toString());

    expect(result.title).toBe("All Users");
    expect(result.sendToAll).toBe(true);
    expect(typeof result.totalTargetUsers).toBe("number");
    expect(result.clickedUsers).toBeDefined();
    expect(result.notClickedUsers).toBeDefined();
  });

  it("should return details for a targeted notification", async () => {
    const notif = await Notification.create({
      title: "Targeted",
      message: "For you",
      sendToAll: false,
      targetUsers: [userId],
      clickedUsers: [userId],
      createdBy: adminId,
    });

    const result = await notificationService.getNotificationDetails(notif._id.toString());

    expect(result.title).toBe("Targeted");
    expect(result.totalTargetUsers).toBe(1);
    expect(result.totalClickedUsers).toBe(1);
    expect(result.totalNotClickedUsers).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// updateNotification
// ---------------------------------------------------------------------------
describe("notificationService.updateNotification", () => {
  let adminId;
  let userId;

  beforeEach(async () => {
    const admin = await Admin.create({
      firstName: "Upd",
      lastName: "Admin",
      phone: "5560000001",
      email: `upd-admin-${Date.now()}@test.com`,
      password: "hashed",
    });
    adminId = admin._id;

    const user = await User.create({
      name: "Upd User",
      email: `upd-user-${Date.now()}@test.com`,
      phone: "5560000002",
      password: "hashed",
    });
    userId = user._id;
  });

  it("should throw 404 for non-existent notification", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    try {
      await notificationService.updateNotification(fakeId, { title: "X" });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/not found/i);
    }
  });

  it("should throw 400 when notification has already been sent", async () => {
    const notif = await Notification.create({
      title: "Sent Notif",
      message: "Already sent",
      sendToAll: true,
      targetUsers: [],
      clickedUsers: [],
      createdBy: adminId,
      sentAt: new Date(),
    });

    try {
      await notificationService.updateNotification(notif._id.toString(), { title: "New Title" });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/already been sent/i);
    }
  });

  it("should update title and message for unsent notification", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const notif = await Notification.create({
      title: "Old Title",
      message: "Old Message",
      sendToAll: true,
      targetUsers: [],
      clickedUsers: [],
      createdBy: adminId,
      scheduledDateTime: future,
    });

    const updated = await notificationService.updateNotification(notif._id.toString(), {
      title: "New Title",
      message: "New Message",
    });

    expect(updated.title).toBe("New Title");
    expect(updated.message).toBe("New Message");
  });

  it("should throw when sendToAll=false with no targetUsers", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const notif = await Notification.create({
      title: "T",
      message: "M",
      sendToAll: true,
      targetUsers: [],
      clickedUsers: [],
      createdBy: adminId,
      scheduledDateTime: future,
    });

    try {
      await notificationService.updateNotification(notif._id.toString(), {
        sendToAll: false,
        targetUsers: [],
      });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/targetUsers must be provided/i);
    }
  });

  it("should throw when targetUsers contains invalid user IDs", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const notif = await Notification.create({
      title: "T",
      message: "M",
      sendToAll: true,
      targetUsers: [],
      clickedUsers: [],
      createdBy: adminId,
      scheduledDateTime: future,
    });

    const fakeUserId = new mongoose.Types.ObjectId().toString();
    try {
      await notificationService.updateNotification(notif._id.toString(), {
        sendToAll: false,
        targetUsers: [fakeUserId],
      });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/invalid/i);
    }
  });

  it("should update targetUsers with valid user IDs", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const notif = await Notification.create({
      title: "T",
      message: "M",
      sendToAll: false,
      targetUsers: [],
      clickedUsers: [],
      createdBy: adminId,
      scheduledDateTime: future,
    });

    const updated = await notificationService.updateNotification(notif._id.toString(), {
      sendToAll: false,
      targetUsers: [userId.toString()],
    });

    expect(updated.targetUsers).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// searchUsers + getAllUsersForNotification
// ---------------------------------------------------------------------------
describe("notificationService.searchUsers", () => {
  beforeEach(async () => {
    await User.create({
      name: "Alice Smith",
      email: "alice.search@test.com",
      phone: "5570000001",
      password: "hashed",
    });
    await User.create({
      name: "Bob Jones",
      email: "bob.search@test.com",
      phone: "5570000002",
      password: "hashed",
    });
  });

  it("should return all users when no search term", async () => {
    const result = await notificationService.searchUsers({});
    expect(result.users).toBeDefined();
    expect(result.pagination).toBeDefined();
    expect(result.pagination.totalUsers).toBeGreaterThanOrEqual(2);
  });

  it("should filter by name search term", async () => {
    const result = await notificationService.searchUsers({ search: "Alice" });
    expect(result.users.length).toBeGreaterThanOrEqual(1);
    expect(result.users[0].name).toMatch(/Alice/i);
  });

  it("should paginate results", async () => {
    const result = await notificationService.searchUsers({ page: 1, limit: 1 });
    expect(result.users).toHaveLength(1);
    expect(result.pagination.totalPages).toBeGreaterThanOrEqual(2);
  });
});

describe("notificationService.getAllUsersForNotification", () => {
  beforeEach(async () => {
    await User.create({
      name: "Notif Target",
      email: `notif-target-${Date.now()}@test.com`,
      phone: "5580000001",
      password: "hashed",
    });
  });

  it("should return list of users", async () => {
    const users = await notificationService.getAllUsersForNotification();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// createNotification — scheduled in future (no send now)
// ---------------------------------------------------------------------------
describe("notificationService.createNotification — scheduled future", () => {
  let adminId;
  let userId;

  beforeEach(async () => {
    const admin = await Admin.create({
      firstName: "Sched",
      lastName: "Admin",
      phone: "5590000001",
      email: `sched-admin-${Date.now()}@test.com`,
      password: "hashed",
    });
    adminId = admin._id;

    const user = await User.create({
      name: "Sched User",
      email: `sched-user-${Date.now()}@test.com`,
      phone: "5590000002",
      password: "hashed",
    });
    userId = user._id;
  });

  it("should schedule notification in the future (not send immediately)", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const result = await notificationService.createNotification({
      title: "Future Notif",
      message: "Scheduled",
      scheduledDateTime: future,
      sendToAll: true,
      adminId: adminId.toString(),
      sendInstantly: false,
    });

    expect(result.title).toBe("Future Notif");
    expect(result.scheduledDateTime).toBeDefined();
  });

  it("should throw when scheduledDateTime is in the past", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();

    try {
      await notificationService.createNotification({
        title: "Past Notif",
        message: "Scheduled",
        scheduledDateTime: past,
        sendToAll: true,
        adminId: adminId.toString(),
      });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/past/i);
    }
  });

  it("should throw 401 when adminId is missing", async () => {
    try {
      await notificationService.createNotification({
        title: "No Admin",
        message: "Missing admin",
        sendToAll: true,
      });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });

  it("should throw when targetUsers contains invalid user IDs", async () => {
    const fakeUserId = new mongoose.Types.ObjectId().toString();
    try {
      await notificationService.createNotification({
        title: "T",
        message: "M",
        sendToAll: false,
        targetUsers: [fakeUserId],
        adminId: adminId.toString(),
      });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/invalid/i);
    }
  });
});

// ---------------------------------------------------------------------------
// trackNotificationClick — edge cases
// ---------------------------------------------------------------------------
describe("notificationService.trackNotificationClick — edge cases", () => {
  let adminId;
  let userId;

  beforeEach(async () => {
    const admin = await Admin.create({
      firstName: "Click",
      lastName: "Admin",
      phone: "5600000001",
      email: `click-admin-${Date.now()}@test.com`,
      password: "hashed",
    });
    adminId = admin._id;

    const user = await User.create({
      name: "Click User",
      email: `click-user-${Date.now()}@test.com`,
      phone: "5600000002",
      password: "hashed",
    });
    userId = user._id;
  });

  it("should throw 400 when notification has no createdBy (non-admin notification)", async () => {
    const notif = await Notification.create({
      title: "User Notif",
      message: "No admin",
      sendToAll: false,
      targetUsers: [userId],
      clickedUsers: [],
      // createdBy intentionally omitted
    });

    try {
      await notificationService.trackNotificationClick(userId.toString(), notif._id.toString());
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/admin notifications/i);
    }
  });

  it("should throw 403 when user is not a target", async () => {
    const otherUser = await User.create({
      name: "Other",
      email: `other-${Date.now()}@test.com`,
      phone: "5600000003",
      password: "hashed",
    });

    const notif = await Notification.create({
      title: "Targeted",
      message: "For other",
      sendToAll: false,
      targetUsers: [otherUser._id],
      clickedUsers: [],
      createdBy: adminId,
    });

    try {
      await notificationService.trackNotificationClick(userId.toString(), notif._id.toString());
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/not a target/i);
    }
  });

  it("should not add duplicate to clickedUsers when already clicked", async () => {
    const notif = await Notification.create({
      title: "Already Clicked",
      message: "Dup test",
      sendToAll: true,
      targetUsers: [],
      clickedUsers: [userId],
      createdBy: adminId,
    });

    await notificationService.trackNotificationClick(userId.toString(), notif._id.toString());

    const saved = await Notification.findById(notif._id);
    const clickCount = saved.clickedUsers.filter(
      (id) => id.toString() === userId.toString()
    ).length;
    expect(clickCount).toBe(1);
  });
});
