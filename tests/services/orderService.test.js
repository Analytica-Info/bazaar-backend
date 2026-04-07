process.env.JWT_SECRET = "test-jwt-secret-key-for-testing";
process.env.STRIPE_SK = "sk_test_fake";
process.env.API_KEY = "fake-ls-key";
process.env.ENVIRONMENT = "test";
process.env.TABBY_AUTH_KEY = "fake-tabby-auth";
process.env.TABBY_SECRET_KEY = "fake-tabby-secret";
process.env.URL = "http://localhost:3000";
process.env.PRODUCTS_UPDATE = "false";
process.env.FRONTEND_BASE_URL = "http://localhost:3000";

require("../setup");

// Mock emailService to prevent actual emails
jest.mock("../../src/mail/emailService", () => ({
  sendEmail: jest.fn(),
}));

// Mock the duplicate Coupon model (Coupons.js) to avoid OverwriteModelError
jest.mock("../../src/models/Coupons", () => ({
  findOne: jest.fn().mockResolvedValue(null),
}));

// Mock stripe (constructor returns an object)
jest.mock("stripe", () => {
  return jest.fn().mockReturnValue({
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  });
});

// Mock sendPushNotification helper
jest.mock("../../src/helpers/sendPushNotification", () => ({
  sendPushNotification: jest.fn(),
}));

// Mock activityLogger and backendLogger
jest.mock("../../src/utilities/activityLogger", () => ({
  logActivity: jest.fn(),
}));
jest.mock("../../src/utilities/backendLogger", () => ({
  logBackendActivity: jest.fn(),
}));

const mongoose = require("mongoose");
const User = require("../../src/models/User");
const Order = require("../../src/models/Order");
const OrderDetail = require("../../src/models/OrderDetail");
const Product = require("../../src/models/Product");
const orderService = require("../../src/services/orderService");

// Helper to create test documents
const makeUser = async (overrides = {}) => {
  return User.create({
    name: "Test User",
    email: "user@test.com",
    phone: "0501234567",
    password: "hashedpassword",
    address: [],
    ...overrides,
  });
};

const makeProduct = async (overrides = {}) => {
  return Product.create({
    product: { name: "Test Product", id: "prod-001", sku_number: "SKU001" },
    variantsData: [{ id: "var-001", qty: 10, name: "Default" }],
    totalQty: 10,
    status: true,
    ...overrides,
  });
};

const makeOrder = async (userId, overrides = {}) => {
  return Order.create({
    userId,
    order_id: "BZR-00001",
    order_no: 1,
    name: "Test User",
    address: "123 Test St",
    email: "user@test.com",
    status: "Confirmed",
    amount_subtotal: "100",
    amount_total: "110",
    discount_amount: "0",
    txn_id: "txn_123",
    payment_method: "card",
    payment_status: "paid",
    ...overrides,
  });
};

const makeOrderDetail = async (orderId, productId, overrides = {}) => {
  return OrderDetail.create({
    order_id: orderId,
    product_id: productId.toString(),
    product_name: "Test Product",
    product_image: "img.jpg",
    variant_name: "Default",
    amount: 50,
    quantity: 1,
    ...overrides,
  });
};

describe("orderService", () => {
  // ---- getAddresses ----
  describe("getAddresses", () => {
    it("should return empty array for new user", async () => {
      const user = await makeUser();

      const result = await orderService.getAddresses(user._id.toString());
      expect(result.flag).toBe(false);
      expect(result.address).toHaveLength(0);
    });
  });

  // ---- storeAddress ----
  describe("storeAddress", () => {
    it("should add address to user", async () => {
      const user = await makeUser();

      const result = await orderService.storeAddress(user._id.toString(), {
        name: "Home",
        city: "Dubai",
        area: "Marina",
        floorNo: "3",
        apartmentNo: "301",
        landmark: "Near Mall",
        buildingName: "Tower A",
        mobile: "0501234567",
        state: "Dubai",
      });

      expect(result.message).toMatch(/added/i);
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].name).toBe("Home");
      expect(result.addresses[0].isPrimary).toBe(true);
    });

    it("should store all address fields correctly", async () => {
      const user = await makeUser();

      const result = await orderService.storeAddress(user._id.toString(), {
        name: "Office",
        city: "Abu Dhabi",
        area: "Corniche",
        floorNo: "10",
        apartmentNo: "1001",
        landmark: "Near Corniche Hospital",
        buildingName: "Tower Z",
        mobile: "0509876543",
        state: "Abu Dhabi",
      });

      const addr = result.addresses[0];
      expect(addr.name).toBe("Office");
      expect(addr.city).toBe("Abu Dhabi");
      expect(addr.area).toBe("Corniche");
      expect(addr.floorNo).toBe("10");
      expect(addr.apartmentNo).toBe("1001");
      expect(addr.landmark).toBe("Near Corniche Hospital");
      expect(addr.buildingName).toBe("Tower Z");
      expect(addr.mobile).toBe("0509876543");
    });

    it("should update an existing address when _id is provided", async () => {
      const user = await makeUser();

      const store1 = await orderService.storeAddress(user._id.toString(), {
        name: "Home",
        city: "Dubai",
        area: "Marina",
        floorNo: "3",
        apartmentNo: "301",
        landmark: "Near Mall",
        buildingName: "Tower A",
        mobile: "0501234567",
        state: "Dubai",
      });

      const addressId = store1.addresses[0]._id.toString();

      const result = await orderService.storeAddress(user._id.toString(), {
        _id: addressId,
        name: "Updated Home",
        city: "Sharjah",
        area: "Al Majaz",
        floorNo: "5",
        apartmentNo: "501",
        landmark: "Near Park",
        buildingName: "Tower B",
        mobile: "0502222222",
        state: "Sharjah",
      });

      expect(result.message).toMatch(/updated/i);
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].name).toBe("Updated Home");
      expect(result.addresses[0].city).toBe("Sharjah");
    });
  });

  // ---- deleteAddress ----
  describe("deleteAddress", () => {
    it("should remove address from user", async () => {
      const user = await makeUser();

      // Add an address first
      const storeResult = await orderService.storeAddress(
        user._id.toString(),
        {
          name: "Office",
          city: "Abu Dhabi",
          area: "Corniche",
          floorNo: "5",
          apartmentNo: "502",
          landmark: "Near Beach",
          buildingName: "Tower B",
          mobile: "0509876543",
          state: "Abu Dhabi",
        }
      );

      const addressId = storeResult.addresses[0]._id.toString();

      const result = await orderService.deleteAddress(
        user._id.toString(),
        addressId
      );

      expect(result.addresses).toHaveLength(0);
    });
  });

  // ---- setPrimaryAddress ----
  describe("setPrimaryAddress", () => {
    it("should set isPrimary flag", async () => {
      const user = await makeUser();

      // Add two addresses
      await orderService.storeAddress(user._id.toString(), {
        name: "Home",
        city: "Dubai",
        area: "Marina",
        floorNo: "3",
        apartmentNo: "301",
        landmark: "Near Mall",
        buildingName: "Tower A",
        mobile: "0501234567",
        state: "Dubai",
      });

      const storeResult2 = await orderService.storeAddress(
        user._id.toString(),
        {
          name: "Office",
          city: "Abu Dhabi",
          area: "Corniche",
          floorNo: "5",
          apartmentNo: "502",
          landmark: "Near Beach",
          buildingName: "Tower B",
          mobile: "0509876543",
          state: "Abu Dhabi",
        }
      );

      // The second address is not primary
      const secondAddr = storeResult2.addresses.find(
        (a) => a.name === "Office"
      );

      const result = await orderService.setPrimaryAddress(
        user._id.toString(),
        secondAddr._id.toString()
      );

      const primary = result.addresses.find((a) => a.isPrimary === true);
      expect(primary.name).toBe("Office");

      // First address should no longer be primary
      const nonPrimary = result.addresses.find((a) => a.name === "Home");
      expect(nonPrimary.isPrimary).toBe(false);
    });

    it("should unset all other addresses isPrimary when setting new primary", async () => {
      const user = await makeUser({ email: "primary-test@test.com" });

      // Add three addresses
      await orderService.storeAddress(user._id.toString(), {
        name: "Addr1", city: "D", area: "A1", floorNo: "1", apartmentNo: "1",
        landmark: "L1", buildingName: "B1", mobile: "050111", state: "D",
      });
      await orderService.storeAddress(user._id.toString(), {
        name: "Addr2", city: "D", area: "A2", floorNo: "2", apartmentNo: "2",
        landmark: "L2", buildingName: "B2", mobile: "050222", state: "D",
      });
      const store3 = await orderService.storeAddress(user._id.toString(), {
        name: "Addr3", city: "D", area: "A3", floorNo: "3", apartmentNo: "3",
        landmark: "L3", buildingName: "B3", mobile: "050333", state: "D",
      });

      const thirdAddr = store3.addresses.find((a) => a.name === "Addr3");

      const result = await orderService.setPrimaryAddress(
        user._id.toString(),
        thirdAddr._id.toString()
      );

      // Only Addr3 should be primary
      const primaryAddresses = result.addresses.filter((a) => a.isPrimary === true);
      expect(primaryAddresses).toHaveLength(1);
      expect(primaryAddresses[0].name).toBe("Addr3");

      // The primary address should be first (sorted)
      expect(result.addresses[0].isPrimary).toBe(true);
    });
  });

  // ---- getOrders ----
  describe("getOrders", () => {
    it("should return empty for user with no orders", async () => {
      const user = await makeUser();

      const result = await orderService.getOrders(user._id.toString());
      expect(result).toHaveLength(0);
    });

    it("should return orders with details", async () => {
      const user = await makeUser();
      const product = await makeProduct();
      const order = await makeOrder(user._id, {
        order_id: "BZR-00010",
        order_no: 10,
      });
      await makeOrderDetail(order._id, product._id);

      const result = await orderService.getOrders(user._id.toString());

      expect(result).toHaveLength(1);
      expect(result[0].order_id).toBe("BZR-00010");
      expect(result[0].details).toHaveLength(1);
      expect(result[0].details[0].product_name).toBe("Test Product");
    });
  });

  // ---- updateOrderStatus ----
  describe("updateOrderStatus", () => {
    it("should update status and add tracking entry", async () => {
      const user = await makeUser();
      const order = await makeOrder(user._id, {
        order_id: "BZR-00020",
        order_no: 20,
      });

      const result = await orderService.updateOrderStatus(
        order._id.toString(),
        "Packed",
        null
      );

      expect(result.status).toBe("Packed");
      expect(result.orderTracks).toHaveLength(1);
      expect(result.orderTracks[0].status).toBe("Packed");
    });
  });

  // ---- validateInventoryBeforeCheckout ----
  describe("validateInventoryBeforeCheckout", () => {
    it.skip("requires Lightspeed API", () => {});
  });

  // ---- createStripeCheckoutSession ----
  describe("createStripeCheckoutSession", () => {
    it.skip("requires Stripe API", () => {});
  });

  // ---- handleTabbyWebhook ----
  describe("handleTabbyWebhook", () => {
    it.skip("requires Tabby API", () => {});
  });

  // ---- uploadProofOfDelivery ----
  describe("uploadProofOfDelivery", () => {
    it("should throw 400 when order_id is missing", async () => {
      try {
        await orderService.uploadProofOfDelivery(null, null, null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/order_id is required/i);
      }
    });

    it("should throw 404 when order not found", async () => {
      try {
        await orderService.uploadProofOfDelivery("BZR-99999", null, null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/order not found/i);
      }
    });

    it("should save proof of delivery from body URLs", async () => {
      const user = await makeUser({ email: "pod@test.com" });
      const order = await makeOrder(user._id, {
        order_id: "BZR-POD01",
        order_no: 9001,
      });

      const result = await orderService.uploadProofOfDelivery(
        "BZR-POD01",
        null,
        ["http://example.com/proof1.jpg", "http://example.com/proof2.jpg"]
      );

      expect(result.message).toMatch(/proof of delivery/i);
      expect(result.order_id).toBe("BZR-POD01");
      expect(result.proof_of_delivery).toHaveLength(2);
    });

    it("should throw 400 when no proof images or URLs are provided", async () => {
      const user = await makeUser({ email: "pod-empty@test.com" });
      await makeOrder(user._id, {
        order_id: "BZR-POD02",
        order_no: 9002,
      });

      try {
        await orderService.uploadProofOfDelivery("BZR-POD02", null, []);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/at least one proof/i);
      }
    });
  });

  // ---- updateOrderStatus (additional) ----
  describe("updateOrderStatus - additional", () => {
    it("should throw 400 when status is missing", async () => {
      const user = await makeUser({ email: "status-null@test.com" });
      const order = await makeOrder(user._id, {
        order_id: "BZR-ST01",
        order_no: 8001,
      });

      try {
        await orderService.updateOrderStatus(order._id.toString(), null, null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/status is required/i);
      }
    });

    it("should throw 400 for invalid status", async () => {
      const user = await makeUser({ email: "status-inv@test.com" });
      const order = await makeOrder(user._id, {
        order_id: "BZR-ST02",
        order_no: 8002,
      });

      try {
        await orderService.updateOrderStatus(order._id.toString(), "InvalidStatus", null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid status/i);
      }
    });

    it("should add tracking entry with image path when filePath is provided", async () => {
      const user = await makeUser({ email: "status-img@test.com" });
      const order = await makeOrder(user._id, {
        order_id: "BZR-ST03",
        order_no: 8003,
      });

      const result = await orderService.updateOrderStatus(
        order._id.toString(),
        "Delivered",
        "uploads/proof/img.jpg"
      );

      expect(result.status).toBe("Delivered");
      expect(result.orderTracks).toHaveLength(1);
      expect(result.orderTracks[0].image).toContain("img.jpg");
    });
  });

  // ---- getOrders (additional) ----
  describe("getOrders - additional", () => {
    it("should return orders with product details populated", async () => {
      const user = await makeUser({ email: "getord-detail@test.com" });
      const product = await makeProduct({
        product: { name: "Detail Product", id: "dp-001", sku_number: "SKU-DP" },
      });
      const order = await makeOrder(user._id, {
        order_id: "BZR-GD01",
        order_no: 7001,
      });
      await makeOrderDetail(order._id, product._id, {
        product_name: "Detail Product",
        amount: 75,
        quantity: 2,
      });

      const result = await orderService.getOrders(user._id.toString());

      expect(result).toHaveLength(1);
      expect(result[0].details).toHaveLength(1);
      expect(result[0].details[0].product_name).toBe("Detail Product");
      expect(result[0].details[0].amount).toBe(75);
      expect(result[0].details[0].quantity).toBe(2);
    });

    it("should map userId to user_id in response", async () => {
      const user = await makeUser({ email: "uid-map@test.com" });
      await makeOrder(user._id, {
        order_id: "BZR-UID01",
        order_no: 7002,
      });

      const result = await orderService.getOrders(user._id.toString());

      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBeDefined();
      expect(result[0].userId).toBeUndefined();
    });
  });
});
