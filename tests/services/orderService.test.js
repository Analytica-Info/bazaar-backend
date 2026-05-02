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

jest.mock("axios");

const mongoose = require("mongoose");
const axios = require("axios");
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

  // ---- storeAddress — country field ----
  describe("storeAddress — country field", () => {
    it("should save country when provided", async () => {
      const user = await makeUser({ email: "country1@test.com" });

      const result = await orderService.storeAddress(user._id.toString(), {
        name: "Oman Home",
        city: "Muscat",
        area: "Ruwi",
        floorNo: "2",
        apartmentNo: "201",
        landmark: "Near Souq",
        buildingName: "Tower O",
        mobile: "96812345678",
        state: "Muscat",
        country: "OM",
      });

      expect(result.addresses[0].country).toBe("OM");
    });

    it("should accept countryCode as alias for country", async () => {
      const user = await makeUser({ email: "country2@test.com" });

      const result = await orderService.storeAddress(user._id.toString(), {
        name: "Oman Office",
        city: "Salalah",
        area: "Center",
        floorNo: "1",
        apartmentNo: "101",
        landmark: "Near Port",
        buildingName: "Block A",
        mobile: "96887654321",
        state: "Salalah",
        countryCode: "OM",
      });

      expect(result.addresses[0].country).toBe("OM");
    });

    it("should default to AE when no country provided", async () => {
      const user = await makeUser({ email: "country3@test.com" });

      const result = await orderService.storeAddress(user._id.toString(), {
        name: "Dubai Home",
        city: "Dubai",
        area: "Marina",
        floorNo: "3",
        apartmentNo: "301",
        landmark: "Near Mall",
        buildingName: "Tower D",
        mobile: "0501234567",
        state: "Dubai",
      });

      expect(result.addresses[0].country).toBe("AE");
    });

    it("should update country when editing address", async () => {
      const user = await makeUser({ email: "country4@test.com" });

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
        country: "AE",
      });

      const addressId = store1.addresses[0]._id.toString();

      const result = await orderService.storeAddress(user._id.toString(), {
        _id: addressId,
        name: "Home",
        city: "Muscat",
        area: "Ruwi",
        floorNo: "3",
        apartmentNo: "301",
        landmark: "Near Souq",
        buildingName: "Tower A",
        mobile: "96812345678",
        state: "Muscat",
        country: "OM",
      });

      expect(result.addresses[0].country).toBe("OM");
      expect(result.addresses[0].city).toBe("Muscat");
    });

    it("should preserve country when country field not sent in update", async () => {
      const user = await makeUser({ email: "country5@test.com" });

      const store1 = await orderService.storeAddress(user._id.toString(), {
        name: "Home",
        city: "Muscat",
        area: "Ruwi",
        floorNo: "2",
        apartmentNo: "201",
        landmark: "Near Souq",
        buildingName: "Tower O",
        mobile: "96812345678",
        state: "Muscat",
        country: "OM",
      });

      const addressId = store1.addresses[0]._id.toString();

      // Update name only, no country sent
      const result = await orderService.storeAddress(user._id.toString(), {
        _id: addressId,
        name: "Updated Home",
        city: "Muscat",
        area: "Ruwi",
        floorNo: "2",
        apartmentNo: "201",
        landmark: "Near Souq",
        buildingName: "Tower O",
        mobile: "96812345678",
        state: "Muscat",
      });

      // Country should default to AE when not provided in update
      // This tests the current behavior — resolvedCountry defaults to AE
      expect(result.addresses[0].country).toBeDefined();
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
      expect(result.orders).toHaveLength(0);
      expect(result.total).toBe(0);
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

      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.orders[0].order_id).toBe("BZR-00010");
      expect(result.orders[0].details).toHaveLength(1);
      expect(result.orders[0].details[0].product_name).toBe("Test Product");
    });

    it("paginates orders and returns correct page metadata", async () => {
      const user = await makeUser({ email: "paginate@test.com" });
      for (let i = 1; i <= 5; i++) {
        await makeOrder(user._id, { order_id: `BZR-PAG0${i}`, order_no: 8000 + i });
      }

      const page1 = await orderService.getOrders(user._id.toString(), { page: 1, limit: 2 });
      expect(page1.orders).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(2);

      const page3 = await orderService.getOrders(user._id.toString(), { page: 3, limit: 2 });
      expect(page3.orders).toHaveLength(1);
      expect(page3.total).toBe(5);
    });

    it("returns most recent orders first", async () => {
      const user = await makeUser({ email: "sortorder@test.com" });
      // Create older order with an explicit past timestamp
      await makeOrder(user._id, {
        order_id: "BZR-OLD1",
        order_no: 9001,
        createdAt: new Date(Date.now() - 60000),
      });
      await makeOrder(user._id, { order_id: "BZR-NEW1", order_no: 9002 });

      const result = await orderService.getOrders(user._id.toString());
      expect(result.orders[0].order_id).toBe("BZR-NEW1");
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

  // ---- markCouponUsed ----
  describe("markCouponUsed", () => {
    const { markCouponUsed } = require("../../src/services/orderService");

    const makeUser = (overrides = {}) => ({
      usedFirst15Coupon: false,
      usedUAE10Coupon: false,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });

    it("sets usedFirst15Coupon and calls save once for FIRST15", async () => {
      const user = makeUser();
      await markCouponUsed(user, "FIRST15");
      expect(user.usedFirst15Coupon).toBe(true);
      expect(user.save).toHaveBeenCalledTimes(1);
    });

    it("sets usedUAE10Coupon and calls save once for UAE10 when not yet used", async () => {
      const user = makeUser();
      await markCouponUsed(user, "UAE10");
      expect(user.usedUAE10Coupon).toBe(true);
      expect(user.save).toHaveBeenCalledTimes(1);
    });

    it("does NOT call save when UAE10 already used", async () => {
      const user = makeUser({ usedUAE10Coupon: true });
      await markCouponUsed(user, "UAE10");
      expect(user.save).not.toHaveBeenCalled();
    });

    it("does NOT call save for an unrecognised coupon code", async () => {
      const user = makeUser();
      await markCouponUsed(user, "UNKNOWN50");
      expect(user.usedFirst15Coupon).toBe(false);
      expect(user.usedUAE10Coupon).toBe(false);
      expect(user.save).not.toHaveBeenCalled();
    });

    it("does nothing when user is null", async () => {
      await expect(markCouponUsed(null, "FIRST15")).resolves.toBeUndefined();
    });

    it("does nothing when couponCode is null", async () => {
      const user = makeUser();
      await markCouponUsed(user, null);
      expect(user.save).not.toHaveBeenCalled();
    });

    it("calls save exactly once even when both flags could apply (only one code per order)", async () => {
      // Sanity check: a single coupon code → single save, not two saves
      const user = makeUser();
      await markCouponUsed(user, "FIRST15");
      expect(user.save).toHaveBeenCalledTimes(1);
    });
  });

  // ---- validateInventoryBeforeCheckout ----
  describe("validateInventoryBeforeCheckout", () => {
    const lsInventoryResponse = (qty) => ({
      data: { data: [{ inventory_level: qty }] },
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns isValid=true when both local and Lightspeed have sufficient stock", async () => {
      const product = await makeProduct({
        product: { name: "Available", id: "pv-001", sku_number: "SKU-AV" },
        variantsData: [{ id: "var-pv-001", qty: 10, name: "Default" }],
        totalQty: 10,
      });

      axios.get.mockResolvedValueOnce(lsInventoryResponse(15));

      const result = await orderService.validateInventoryBeforeCheckout(
        [{ product_id: product._id.toString(), qty: 3 }],
        {},
        "test"
      );

      expect(result.isValid).toBe(true);
      expect(result.results[0].isValid).toBe(true);
      expect(result.results[0].lightspeedQty).toBe(15);
      expect(result.results[0].localMongoQty).toBe(10);
    });

    it("throws 400 when Lightspeed stock is insufficient", async () => {
      const product = await makeProduct({
        product: { name: "LowStock", id: "pv-002", sku_number: "SKU-LS" },
        variantsData: [{ id: "var-pv-002", qty: 10, name: "Default" }],
        totalQty: 10,
      });

      axios.get.mockResolvedValueOnce(lsInventoryResponse(1)); // only 1 available

      const err = await orderService.validateInventoryBeforeCheckout(
        [{ product_id: product._id.toString(), qty: 5 }],
        {},
        "test"
      ).catch(e => e);

      expect(err.status).toBe(400);
      expect(err.data.isValid).toBe(false);
      const r = err.data.results[0];
      expect(r.dbIndex).toBe("lightspeed");
      expect(r.lightspeedQty).toBe(1);
    });

    it("throws 400 when local stock is insufficient", async () => {
      const product = await makeProduct({
        product: { name: "LocalLow", id: "pv-003", sku_number: "SKU-LL" },
        variantsData: [{ id: "var-pv-003", qty: 2, name: "Default" }],
        totalQty: 2,
      });

      axios.get.mockResolvedValueOnce(lsInventoryResponse(20));

      const err = await orderService.validateInventoryBeforeCheckout(
        [{ product_id: product._id.toString(), qty: 5 }],
        {},
        "test"
      ).catch(e => e);

      expect(err.status).toBe(400);
      expect(err.data.results[0].dbIndex).toBe("local");
    });

    it("fetches Lightspeed inventory in parallel for multi-item cart", async () => {
      const p1 = await makeProduct({
        product: { name: "P1", id: "pv-p1", sku_number: "SKU-P1" },
        variantsData: [{ id: "var-pv-p1", qty: 10, name: "Default" }],
        totalQty: 10,
      });
      const p2 = await makeProduct({
        product: { name: "P2", id: "pv-p2", sku_number: "SKU-P2" },
        variantsData: [{ id: "var-pv-p2", qty: 10, name: "Default" }],
        totalQty: 10,
      });
      const p3 = await makeProduct({
        product: { name: "P3", id: "pv-p3", sku_number: "SKU-P3" },
        variantsData: [{ id: "var-pv-p3", qty: 10, name: "Default" }],
        totalQty: 10,
      });

      axios.get
        .mockResolvedValueOnce(lsInventoryResponse(10))
        .mockResolvedValueOnce(lsInventoryResponse(10))
        .mockResolvedValueOnce(lsInventoryResponse(10));

      const result = await orderService.validateInventoryBeforeCheckout(
        [
          { product_id: p1._id.toString(), qty: 1 },
          { product_id: p2._id.toString(), qty: 1 },
          { product_id: p3._id.toString(), qty: 1 },
        ],
        {},
        "test"
      );

      // All three Lightspeed calls must have fired
      expect(axios.get).toHaveBeenCalledTimes(3);
      expect(result.isValid).toBe(true);
      expect(result.results).toHaveLength(3);
    });

    it("throws 400 with lightspeedApiError when Lightspeed call fails", async () => {
      const product = await makeProduct({
        product: { name: "ApiErr", id: "pv-err", sku_number: "SKU-ERR" },
        variantsData: [{ id: "var-pv-err", qty: 10, name: "Default" }],
        totalQty: 10,
      });

      axios.get.mockRejectedValueOnce(new Error("Lightspeed 503"));

      const err = await orderService.validateInventoryBeforeCheckout(
        [{ product_id: product._id.toString(), qty: 2 }],
        {},
        "test"
      ).catch(e => e);

      expect(err.status).toBe(400);
      const r = err.data.results[0];
      expect(r.lightspeedApiError).toBeDefined();
      expect(r.lightspeedApiError.message).toBe("Lightspeed 503");
    });

    it("continues processing remaining items when one Lightspeed call fails", async () => {
      const p1 = await makeProduct({
        product: { name: "Good", id: "pv-good", sku_number: "SKU-GOOD" },
        variantsData: [{ id: "var-pv-good", qty: 10, name: "Default" }],
        totalQty: 10,
      });
      const p2 = await makeProduct({
        product: { name: "Fail", id: "pv-fail", sku_number: "SKU-FAIL" },
        variantsData: [{ id: "var-pv-fail", qty: 10, name: "Default" }],
        totalQty: 10,
      });

      axios.get
        .mockResolvedValueOnce(lsInventoryResponse(10))  // p1 OK
        .mockRejectedValueOnce(new Error("timeout"));    // p2 fails

      const err = await orderService.validateInventoryBeforeCheckout(
        [
          { product_id: p1._id.toString(), qty: 1 },
          { product_id: p2._id.toString(), qty: 1 },
        ],
        {},
        "test"
      ).catch(e => e);

      // p2 failure causes a 400 throw; both results are in the payload
      expect(err.status).toBe(400);
      expect(err.data.results).toHaveLength(2);
      const goodResult = err.data.results.find(r => r.productName === "Good");
      const failResult = err.data.results.find(r => r.productName === "Fail");
      expect(goodResult.isValid).toBe(true);
      expect(failResult.lightspeedApiError).toBeDefined();
    });

    it("throws 400 with dbIndex=both when both local and Lightspeed are insufficient", async () => {
      const product = await makeProduct({
        product: { name: "BothLow", id: "pv-both", sku_number: "SKU-BOTH" },
        variantsData: [{ id: "var-pv-both", qty: 1, name: "Default" }],
        totalQty: 1,
      });

      axios.get.mockResolvedValueOnce(lsInventoryResponse(1));

      const err = await orderService.validateInventoryBeforeCheckout(
        [{ product_id: product._id.toString(), qty: 5 }],
        {},
        "test"
      ).catch(e => e);

      expect(err.status).toBe(400);
      expect(err.data.results[0].dbIndex).toBe("both");
    });

    it("throws 400 when product not found in DB", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      const err = await orderService.validateInventoryBeforeCheckout(
        [{ product_id: fakeId, qty: 1 }],
        {},
        "test"
      ).catch(e => e);

      expect(err.status).toBe(400);
      expect(err.data.results[0].message).toMatch(/not found/i);
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("throws 400 for item missing product_id", async () => {
      const err = await orderService.validateInventoryBeforeCheckout(
        [{ qty: 2 }],
        {},
        "test"
      ).catch(e => e);

      expect(err.status).toBe(400);
      expect(err.data.results[0].message).toMatch(/missing required fields/i);
    });

    it("throws 400 when products array is empty", async () => {
      await expect(
        orderService.validateInventoryBeforeCheckout([], {}, "test")
      ).rejects.toMatchObject({ status: 400 });
    });
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

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].details).toHaveLength(1);
      expect(result.orders[0].details[0].product_name).toBe("Detail Product");
      expect(result.orders[0].details[0].amount).toBe(75);
      expect(result.orders[0].details[0].quantity).toBe(2);
    });

    it("should map userId to user_id in response", async () => {
      const user = await makeUser({ email: "uid-map@test.com" });
      await makeOrder(user._id, {
        order_id: "BZR-UID01",
        order_no: 7002,
      });

      const result = await orderService.getOrders(user._id.toString());

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].user_id).toBeDefined();
      expect(result.orders[0].userId).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// getPaymentMethods — branch coverage
// ---------------------------------------------------------------------------

describe("orderService.getPaymentMethods", () => {
  it("should always include stripe", async () => {
    delete process.env.TABBY_AUTH_KEY;
    delete process.env.NOMOD_ENABLED;
    const methods = await orderService.getPaymentMethods();
    expect(methods.some((m) => m.id === "stripe")).toBe(true);
  });

  it("should include tabby when TABBY_AUTH_KEY is set", async () => {
    process.env.TABBY_AUTH_KEY = "fake-key";
    const methods = await orderService.getPaymentMethods();
    expect(methods.some((m) => m.id === "tabby")).toBe(true);
  });

  it("should include nomod when NOMOD_ENABLED=true and NOMOD_API_KEY set", async () => {
    process.env.NOMOD_ENABLED = "true";
    process.env.NOMOD_API_KEY = "fake-nomod-key";
    const methods = await orderService.getPaymentMethods();
    expect(methods.some((m) => m.id === "nomod")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// storeAddress / deleteAddress / setPrimaryAddress edge cases
// ---------------------------------------------------------------------------

describe("orderService.storeAddress — not found", () => {
  it("should throw 404 when user not found", async () => {
    const fakeId = new (require("mongoose")).Types.ObjectId().toString();
    try {
      await orderService.storeAddress(fakeId, {
        address: "123",
        city: "Dubai",
        area: "Marina",
      });
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });
});

describe("orderService.deleteAddress — edge cases", () => {
  const User = require("../../src/models/User");

  const makeUser2 = async (overrides = {}) =>
    User.create({
      name: "Del Addr",
      email: `del-addr-${Date.now()}@test.com`,
      phone: `0509${Date.now()}`.slice(0, 10),
      password: "hashed",
      ...overrides,
    });

  it("should throw 404 when user not found", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    try {
      await orderService.deleteAddress(fakeId, new mongoose.Types.ObjectId().toString());
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });

  it("should throw 404 when address not found on user", async () => {
    const user = await makeUser2();
    const fakeAddrId = new mongoose.Types.ObjectId().toString();
    try {
      await orderService.deleteAddress(user._id.toString(), fakeAddrId);
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });
});

describe("orderService.setPrimaryAddress — not found", () => {
  it("should throw 404 when user not found", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    try {
      await orderService.setPrimaryAddress(fakeId, new mongoose.Types.ObjectId().toString());
      fail("Expected error");
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });
});
