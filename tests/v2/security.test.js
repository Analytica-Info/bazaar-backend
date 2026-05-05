/**
 * V2 security regression tests.
 * - IDOR on updateOrderStatus and verifyTabbyPayment / verifyNomodPayment
 * - markNotificationsAsRead bound on ids array length
 */
process.env.STRIPE_SK = process.env.STRIPE_SK || "sk_test_dummy";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
require("../setup");
const mongoose = require("mongoose");

jest.mock("../../src/helpers/sendPushNotification", () => ({
  sendNotificationToUsers: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/activityLogger", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/backendLogger", () => ({
  logBackendActivity: jest.fn().mockResolvedValue(undefined),
}));

const Order = require("../../src/models/Order");
const PendingPayment = require("../../src/models/PendingPayment");
const Notification = require("../../src/models/Notification");
const orderService = require("../../src/services/orderService");
const notificationService = require("../../src/services/notificationService");

describe("v2 security regressions", () => {
  describe("updateOrderStatus IDOR", () => {
    test("rejects status update from a non-owner with 403", async () => {
      const ownerId = new mongoose.Types.ObjectId();
      const attackerId = new mongoose.Types.ObjectId();
      const order = new Order({ userId: ownerId, status: "Confirmed" });
      await order.save({ validateBeforeSave: false });

      await expect(
        orderService.updateOrderStatus(order._id, "Packed", null, attackerId)
      ).rejects.toMatchObject({ status: 403 });
    });

    test("recognizes legacy user_id field for ownership", async () => {
      const ownerId = new mongoose.Types.ObjectId();
      const attackerId = new mongoose.Types.ObjectId();
      const order = new Order({ user_id: ownerId, status: "Confirmed" });
      await order.save({ validateBeforeSave: false });

      await expect(
        orderService.updateOrderStatus(order._id, "Packed", null, attackerId)
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("verifyTabbyPayment IDOR", () => {
    test("rejects verification when paymentId belongs to another user", async () => {
      const ownerId = new mongoose.Types.ObjectId();
      const attackerId = new mongoose.Types.ObjectId();
      await PendingPayment.create({
        user_id: ownerId,
        payment_id: "tabby_pay_123",
        payment_method: "tabby",
        order_data: {},
        status: "pending",
        orderfrom: "Mobile App",
        orderTime: "now",
      });

      await expect(
        orderService.verifyTabbyPayment("tabby_pay_123", attackerId)
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("verifyNomodPayment IDOR", () => {
    test("rejects verification when paymentId belongs to another user", async () => {
      const ownerId = new mongoose.Types.ObjectId();
      const attackerId = new mongoose.Types.ObjectId();
      await PendingPayment.create({
        user_id: ownerId,
        payment_id: "nomod_pay_123",
        payment_method: "nomod",
        order_data: {},
        status: "pending",
        orderfrom: "Mobile App",
        orderTime: "now",
      });

      await expect(
        orderService.verifyNomodPayment("nomod_pay_123", attackerId)
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("markNotificationsAsRead", () => {
    // The 100-id cap moved to v2 controllers (web + mobile). The service
    // itself remains uncapped to preserve v1 mobile behavior.
    test("service accepts large id arrays (cap is enforced at v2 controller)", async () => {
      const userId = new mongoose.Types.ObjectId();
      const ids = Array.from({ length: 200 }, () => new mongoose.Types.ObjectId().toString());
      const result = await notificationService.markNotificationsAsRead(userId, ids);
      expect(result).toEqual({});
    });

    test("rejects empty ids array", async () => {
      const userId = new mongoose.Types.ObjectId();
      await expect(
        notificationService.markNotificationsAsRead(userId, [])
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
