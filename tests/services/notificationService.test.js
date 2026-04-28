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
