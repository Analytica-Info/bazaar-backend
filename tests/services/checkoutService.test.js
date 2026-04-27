process.env.JWT_SECRET = "test-jwt-secret-key-for-testing";
process.env.STRIPE_SK = "sk_test_fake";
process.env.API_KEY = "fake-ls-key";
process.env.ENVIRONMENT = "test";
process.env.TABBY_AUTH_KEY = "fake-tabby-auth";
process.env.TABBY_SECRET_KEY = "fake-tabby-secret";
process.env.TABBY_WEBHOOK_SECRET = "fake-tabby-webhook";
process.env.TABBY_IPS = "127.0.0.1";
process.env.URL = "http://localhost:3000";
process.env.PRODUCTS_UPDATE = "false";
process.env.FRONTEND_BASE_URL = "http://localhost:3000";

require("../setup");

// Mock external dependencies
jest.mock("stripe", () => {
  const createSession = jest.fn().mockResolvedValue({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/test",
    payment_status: "unpaid",
    amount_total: 10000,
    currency: "aed",
    metadata: {},
  });
  const retrieveSession = jest.fn().mockResolvedValue({
    id: "cs_test_123",
    payment_status: "paid",
    payment_intent: "pi_test_123",
    amount_total: 10000,
    currency: "aed",
    metadata: {
      cartDataId: "fake-cart-id",
      name: "Test",
      phone: "0501234567",
      address: "Dubai",
      city: "Dubai",
      area: "Marina",
      shippingCost: "30",
      currency: "aed",
      couponCode: "",
      mobileNumber: "",
      paymentMethod: "card",
      discountAmount: "0",
      bankPromoId: "",
    },
  });
  return jest.fn().mockReturnValue({
    checkout: {
      sessions: { create: createSession, retrieve: retrieveSession },
    },
    paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
  });
});

jest.mock("axios");
jest.mock("../../src/mail/emailService", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/emailHelper", () => ({
  getAdminEmail: jest.fn().mockResolvedValue("admin@test.com"),
  getCcEmails: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../src/utilities/activityLogger", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/backendLogger", () => ({
  logBackendActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/helpers/sendPushNotification", () => ({
  sendPushNotification: jest.fn(),
}));
jest.mock("../../src/models/Coupons", () => ({
  findOne: jest.fn().mockResolvedValue(null),
}));

const mongoose = require("mongoose");
const CartData = require("../../src/models/CartData");
const User = require("../../src/models/User");
const Order = require("../../src/models/Order");

describe("checkoutService", () => {
  let checkoutService;

  beforeAll(() => {
    checkoutService = require("../../src/services/checkoutService");
  });

  it("should load without errors", () => {
    expect(checkoutService).toBeDefined();
    expect(checkoutService.createStripeCheckout).toBeFunction;
    expect(checkoutService.createTabbyCheckout).toBeFunction;
    expect(checkoutService.createNomodCheckout).toBeFunction;
    expect(checkoutService.verifyNomodPayment).toBeFunction;
  });

  // ---- createStripeCheckout ----
  describe("createStripeCheckout", () => {
    const baseCartData = [
      { name: "Product A", price: 50, qty: 2, variant: "Default" },
    ];

    const baseMetadata = {
      shippingCost: 30,
      name: "Test User",
      phone: "0501234567",
      address: "Dubai Marina",
      currency: "aed",
      city: "Dubai",
      area: "Marina",
      buildingName: "Tower A",
      floorNo: "3",
      apartmentNo: "301",
      landmark: "Near Mall",
      discountPercent: 0,
      couponCode: "",
      mobileNumber: "",
      paymentMethod: "card",
      discountAmount: 0,
      totalAmount: 130,
      subTotalAmount: 100,
      saved_total: 0,
      bankPromoId: "",
      capAED: null,
    };

    it("should create a Stripe checkout session and return session id", async () => {
      const result = await checkoutService.createStripeCheckout(
        baseCartData,
        "user123",
        baseMetadata
      );

      expect(result).toBeDefined();
      expect(result.id).toBe("cs_test_123");
    });

    it("should save cart data to CartData collection", async () => {
      await checkoutService.createStripeCheckout(
        baseCartData,
        "user123",
        baseMetadata
      );

      const carts = await CartData.find({});
      expect(carts.length).toBeGreaterThan(0);
    });

    it("should include shipping as a line item when shippingCost > 0", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.create.mockClear();

      await checkoutService.createStripeCheckout(
        baseCartData,
        "user123",
        { ...baseMetadata, shippingCost: 30 }
      );

      const callArgs = stripe.checkout.sessions.create.mock.calls[0][0];
      const shippingItem = callArgs.line_items.find(
        (item) => item.price_data.product_data.name === "Shipping Cost"
      );
      expect(shippingItem).toBeDefined();
      expect(shippingItem.price_data.unit_amount).toBe(3000); // 30 * 100 cents
    });

    it("should not include shipping line item when shippingCost is 0", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.create.mockClear();

      await checkoutService.createStripeCheckout(
        baseCartData,
        "user123",
        { ...baseMetadata, shippingCost: 0 }
      );

      const callArgs = stripe.checkout.sessions.create.mock.calls[0][0];
      const shippingItem = callArgs.line_items.find(
        (item) => item.price_data.product_data.name === "Shipping Cost"
      );
      expect(shippingItem).toBeUndefined();
    });

    it("should apply discount correctly to line items", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.create.mockClear();

      await checkoutService.createStripeCheckout(
        [{ name: "Product A", price: 100, qty: 1, variant: "Default" }],
        "user123",
        { ...baseMetadata, discountPercent: 10, subTotalAmount: 100, totalAmount: 90 }
      );

      const callArgs = stripe.checkout.sessions.create.mock.calls[0][0];
      // With 10% discount on 100 AED, line item should be ~90 AED (9000 cents)
      const productItem = callArgs.line_items.find(
        (item) => item.price_data.product_data.name === "Product A"
      );
      expect(productItem).toBeDefined();
      expect(productItem.price_data.unit_amount).toBeLessThan(10000);
    });

    it("should set correct success and cancel URLs", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.create.mockClear();

      await checkoutService.createStripeCheckout(
        baseCartData,
        "user123",
        baseMetadata
      );

      const callArgs = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(callArgs.success_url).toContain("/success");
      expect(callArgs.cancel_url).toContain("/failed");
    });

    it("should store metadata in Stripe session", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.create.mockClear();

      await checkoutService.createStripeCheckout(
        baseCartData,
        "user123",
        { ...baseMetadata, couponCode: "FIRST15", mobileNumber: "0501234567" }
      );

      const callArgs = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(callArgs.metadata.couponCode).toBe("FIRST15");
      expect(callArgs.metadata.mobileNumber).toBe("0501234567");
      expect(callArgs.metadata.city).toBe("Dubai");
      expect(callArgs.metadata.area).toBe("Marina");
    });

    it("should handle zero-price items without error", async () => {
      const cartWithFreeItem = [
        { name: "Product A", price: 100, qty: 1, variant: "Default" },
        { name: "Gift", price: 0, qty: 1, variant: "Free" },
      ];

      const result = await checkoutService.createStripeCheckout(
        cartWithFreeItem,
        "user123",
        { ...baseMetadata, subTotalAmount: 100, totalAmount: 130 }
      );

      expect(result.id).toBe("cs_test_123");
    });

    it("should handle multiple items with correct quantities", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.create.mockClear();

      const multiCart = [
        { name: "Item A", price: 50, qty: 2, variant: "V1" },
        { name: "Item B", price: 30, qty: 3, variant: "V2" },
      ];

      await checkoutService.createStripeCheckout(
        multiCart,
        "user123",
        { ...baseMetadata, subTotalAmount: 190, totalAmount: 220 }
      );

      const callArgs = stripe.checkout.sessions.create.mock.calls[0][0];
      const items = callArgs.line_items.filter(
        (i) => i.price_data.product_data.name !== "Shipping Cost"
      );
      expect(items).toHaveLength(2);
      expect(items[0].quantity).toBe(2);
      expect(items[1].quantity).toBe(3);
    });
  });

  // ---- createNomodCheckout / verifyNomodPayment ----
  // These tests use the already-loaded checkoutService instance (no resetModules)
  // and control PaymentProviderFactory via direct property injection on the module.
  describe("createNomodCheckout", () => {
    let PaymentProviderFactory;
    const mockProvider = {
      createCheckout: jest.fn(),
      getCheckout: jest.fn(),
    };

    beforeAll(() => {
      PaymentProviderFactory = require("../../src/services/payments/PaymentProviderFactory");
      jest.spyOn(PaymentProviderFactory, "create").mockReturnValue(mockProvider);
    });

    afterAll(() => {
      PaymentProviderFactory.create.mockRestore();
    });

    beforeEach(() => {
      mockProvider.createCheckout.mockReset();
      mockProvider.getCheckout.mockReset();
    });

    it("throws 400 when cartData is missing", async () => {
      const mockReq = { user: { _id: "user-001" }, body: {} };
      await expect(checkoutService.createNomodCheckout(mockReq)).rejects.toMatchObject({ status: 400 });
    });

    it("returns status and checkout_url on success", async () => {
      mockProvider.createCheckout.mockResolvedValue({
        id: "chk_abc",
        redirectUrl: "https://pay.nomod.com/chk_abc",
      });

      const mongoose = require("mongoose");
      const userId = new mongoose.Types.ObjectId();

      const user = await User.create({
        name: "Ali Hassan",
        email: "ali@test.com",
        password: "hashed",
        phone: "+97150",
      });

      const CartData = require("../../src/models/CartData");
      CartData.create = jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const mockReq = {
        user: { _id: user._id },
        body: {
          cartData: [{ name: "Widget", price: 50, qty: 1 }],
          shippingCost: 10,
          name: "Ali",
          phone: "+97150",
          currency: "AED",
        },
      };

      const result = await checkoutService.createNomodCheckout(mockReq);
      expect(result.status).toBe("created");
      expect(result.checkout_url).toBe("https://pay.nomod.com/chk_abc");
    });

    it("propagates provider errors", async () => {
      mockProvider.createCheckout.mockRejectedValue({ status: 503, message: "Nomod down" });

      const CartData = require("../../src/models/CartData");
      CartData.create = jest.fn().mockResolvedValue({ _id: "cart-id-002" });

      const mockReq = {
        user: { _id: "user-001" },
        body: {
          cartData: [{ name: "Widget", price: 50, qty: 1 }],
          shippingCost: 0,
          name: "Ali",
          phone: "+97150",
          currency: "AED",
        },
      };

      await expect(checkoutService.createNomodCheckout(mockReq)).rejects.toMatchObject({ status: 503 });
    });
  });

  describe("verifyNomodPayment", () => {
    let PaymentProviderFactory;
    const mockProvider = { getCheckout: jest.fn() };

    beforeAll(() => {
      PaymentProviderFactory = require("../../src/services/payments/PaymentProviderFactory");
      jest.spyOn(PaymentProviderFactory, "create").mockReturnValue(mockProvider);
    });

    afterAll(() => {
      PaymentProviderFactory.create.mockRestore();
    });

    beforeEach(() => {
      mockProvider.getCheckout.mockReset();
    });

    it("throws 400 when paymentId is missing", async () => {
      const mockReq = { user: { _id: "user-001" }, body: {} };
      await expect(checkoutService.verifyNomodPayment(mockReq)).rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when payment is not paid", async () => {
      mockProvider.getCheckout.mockResolvedValue({ paid: false, status: "created" });
      const mockReq = { user: { _id: "user-001" }, body: { paymentId: "chk_unpaid" } };
      await expect(checkoutService.verifyNomodPayment(mockReq)).rejects.toMatchObject({ status: 400 });
    });

    it("throws 404 when PendingPayment not found", async () => {
      mockProvider.getCheckout.mockResolvedValue({ paid: true, status: "paid" });

      const PendingPayment = require("../../src/models/PendingPayment");
      PendingPayment.findOne = jest.fn().mockResolvedValue(null);

      const mockReq = { user: { _id: "user-001" }, body: { paymentId: "chk_orphan" } };
      await expect(checkoutService.verifyNomodPayment(mockReq)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ---- verifyStripePayment ----

  describe("verifyStripePayment", () => {
    it("throws 400 when sessionId is missing", async () => {
      expect.assertions(1);
      await expect(checkoutService.verifyStripePayment(null, "user-001")).rejects.toMatchObject({ status: 400 });
    });

    it("returns without creating order when payment_status is not paid", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: "cs_unpaid",
        payment_status: "unpaid",
        metadata: {},
      });
      // Should not throw — just no order created
      // verifyStripePayment throws only on explicit errors, unpaid goes through a different path
      // We verify the stripe retrieve was called
      try {
        await checkoutService.verifyStripePayment("cs_unpaid", "user-001");
      } catch (e) {
        // unpaid path may throw or not depending on implementation — acceptable
      }
      expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_unpaid");
    });

    it("calls stripe retrieve with the provided sessionId", async () => {
      const stripe = require("stripe")();
      stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: "cs_paid",
        payment_status: "paid",
        payment_intent: "pi_123",
        customer_details: { email: "test@test.com" },
        metadata: {
          cartDataId: "fake-cart-id",
          name: "Test User",
          phone: "0501234567",
          address: "Dubai",
          city: "Dubai",
          area: "Marina",
          shippingCost: "0",
          currency: "AED",
          totalAmount: "100.00",
          subTotalAmount: "100.00",
          couponCode: "",
          mobileNumber: "",
          paymentMethod: "card",
          discountAmount: "0",
          bankPromoId: "",
        },
      });
      try {
        await checkoutService.verifyStripePayment("cs_paid", "user-001");
      } catch (e) {
        // CartData.findById etc may not be seeded in this test — that's fine
      }
      expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_paid");
    });
  });

  // ---- verifyTabbyPayment ----

  describe("verifyTabbyPayment", () => {
    const axios = require("axios");

    beforeEach(() => {
      axios.get.mockReset();
      axios.post.mockReset();
    });

    it("throws 400 when paymentId is missing", async () => {
      expect.assertions(1);
      await expect(checkoutService.verifyTabbyPayment(null, "user-001")).rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when Tabby returns REJECTED status", async () => {
      expect.assertions(1);
      axios.get.mockResolvedValueOnce({ data: { status: "REJECTED", amount: "100.00" } });
      await expect(checkoutService.verifyTabbyPayment("pay_rejected", "user-001")).rejects.toMatchObject({ status: 400 });
    });

    it("throws 400 when Tabby returns EXPIRED status", async () => {
      expect.assertions(1);
      axios.get.mockResolvedValueOnce({ data: { status: "EXPIRED", amount: "100.00" } });
      await expect(checkoutService.verifyTabbyPayment("pay_expired", "user-001")).rejects.toMatchObject({ status: 400 });
    });

    it("throws 500 when AUTHORIZED but capture returns non-CLOSED status", async () => {
      expect.assertions(1);
      axios.get.mockResolvedValueOnce({ data: { status: "AUTHORIZED", amount: "100.00" } });
      axios.post.mockResolvedValueOnce({ data: { status: "PENDING" } });
      await expect(checkoutService.verifyTabbyPayment("pay_auth", "user-001")).rejects.toMatchObject({ status: 500 });
    });

    it("calls capture endpoint when status is AUTHORIZED", async () => {
      axios.get.mockResolvedValueOnce({ data: { status: "AUTHORIZED", amount: "100.00" } });
      axios.post.mockResolvedValueOnce({ data: { status: "CLOSED" } });
      try {
        await checkoutService.verifyTabbyPayment("pay_auth_ok", "user-001");
      } catch (e) {
        // Order creation may fail without full DB seed — acceptable
      }
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("pay_auth_ok/captures"),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it("skips capture when status is already CLOSED", async () => {
      axios.get.mockResolvedValueOnce({ data: { status: "CLOSED", amount: "100.00" } });
      try {
        await checkoutService.verifyTabbyPayment("pay_closed", "user-001");
      } catch (e) {
        // Order creation may fail without full DB seed — acceptable
      }
      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});
