process.env.STRIPE_SK = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake";
process.env.URL = "http://localhost:3000";

// Mock stripe at the module level
let mockSession;
let mockRefund;
let mockExpire;
let mockRetrieve;
let mockConstructEvent;

jest.mock("stripe", () => {
  mockSession = jest.fn();
  mockRetrieve = jest.fn();
  mockRefund = jest.fn();
  mockExpire = jest.fn();
  mockConstructEvent = jest.fn();

  return jest.fn().mockReturnValue({
    checkout: {
      sessions: {
        create: (...args) => mockSession(...args),
        retrieve: (...args) => mockRetrieve(...args),
        expire: (...args) => mockExpire(...args),
      },
    },
    refunds: {
      create: (...args) => mockRefund(...args),
    },
    webhooks: {
      constructEvent: (...args) => mockConstructEvent(...args),
    },
  });
});

const StripeProvider = require("../../src/services/payments/StripeProvider");

beforeEach(() => {
  jest.clearAllMocks();
});

const checkoutArgs = {
  referenceId: "ref-001",
  amount: 200,
  currency: "AED",
  discount: 20,
  items: [{ name: "Widget", quantity: 2, price: 90 }],
  shippingCost: 20,
  customer: { name: "Test User", email: "test@example.com" },
  successUrl: "https://example.com/success",
  failureUrl: "https://example.com/fail",
  cancelledUrl: "https://example.com/cancel",
};

describe("StripeProvider", () => {
  let provider;

  beforeEach(() => {
    provider = new StripeProvider();
  });

  // ─── createCheckout ─────────────────────────────────────────────────────────

  describe("createCheckout", () => {
    it("returns id and redirectUrl on success", async () => {
      mockSession.mockResolvedValue({
        id: "cs_test_001",
        url: "https://checkout.stripe.com/cs_test_001",
      });

      const result = await provider.createCheckout(checkoutArgs);
      expect(result.id).toBe("cs_test_001");
      expect(result.redirectUrl).toBe("https://checkout.stripe.com/cs_test_001");
      expect(result.raw).toBeDefined();
    });

    it("includes shipping line item when shippingCost > 0", async () => {
      mockSession.mockResolvedValue({ id: "cs_x", url: "https://stripe.com/x" });

      await provider.createCheckout(checkoutArgs);

      const call = mockSession.mock.calls[0][0];
      const shippingItem = call.line_items.find((i) => i.price_data.product_data.name === "Shipping Cost");
      expect(shippingItem).toBeDefined();
      expect(shippingItem.price_data.unit_amount).toBe(2000); // 20 * 100
    });

    it("does not add shipping line item when shippingCost is 0", async () => {
      mockSession.mockResolvedValue({ id: "cs_y", url: "https://stripe.com/y" });

      await provider.createCheckout({ ...checkoutArgs, shippingCost: 0 });

      const call = mockSession.mock.calls[0][0];
      const shippingItem = call.line_items.find((i) => i.price_data.product_data.name === "Shipping Cost");
      expect(shippingItem).toBeUndefined();
    });

    it("throws structured error on API failure", async () => {
      mockSession.mockRejectedValue({ message: "Card declined", statusCode: 402 });

      await expect(provider.createCheckout(checkoutArgs)).rejects.toMatchObject({
        status: 500,
        message: "Card declined",
      });
    });

    it("converts currency to lowercase in line items", async () => {
      mockSession.mockResolvedValue({ id: "cs_z", url: "https://stripe.com/z" });

      await provider.createCheckout({ ...checkoutArgs, currency: "USD" });

      const call = mockSession.mock.calls[0][0];
      expect(call.line_items[0].price_data.currency).toBe("usd");
    });

    it("encodes referenceId in metadata", async () => {
      mockSession.mockResolvedValue({ id: "cs_meta", url: "https://stripe.com/meta" });

      await provider.createCheckout(checkoutArgs);

      const call = mockSession.mock.calls[0][0];
      expect(call.metadata.reference_id).toBe("ref-001");
    });
  });

  // ─── getCheckout ────────────────────────────────────────────────────────────

  describe("getCheckout", () => {
    it("returns paid: true when payment_status is paid", async () => {
      mockRetrieve.mockResolvedValue({
        id: "cs_paid",
        payment_status: "paid",
        status: "complete",
        amount_total: 20000,
        currency: "aed",
      });

      const result = await provider.getCheckout("cs_paid");
      expect(result.paid).toBe(true);
      expect(result.status).toBe("paid");
      expect(result.amount).toBe(200); // 20000 / 100
      expect(result.currency).toBe("AED");
    });

    it("returns paid: false for unpaid status", async () => {
      mockRetrieve.mockResolvedValue({
        id: "cs_open",
        payment_status: "unpaid",
        status: "open",
        amount_total: 10000,
        currency: "aed",
      });

      const result = await provider.getCheckout("cs_open");
      expect(result.paid).toBe(false);
      expect(result.status).toBe("open");
    });

    it("throws structured error on retrieval failure", async () => {
      mockRetrieve.mockRejectedValue({ statusCode: 404, message: "No such checkout session" });

      await expect(provider.getCheckout("bad-id")).rejects.toMatchObject({
        status: 404,
        message: "No such checkout session",
      });
    });

    it("falls back to status 500 when statusCode not on error", async () => {
      mockRetrieve.mockRejectedValue({ message: "Network error" });

      await expect(provider.getCheckout("err-id")).rejects.toMatchObject({ status: 500 });
    });
  });

  // ─── refund ─────────────────────────────────────────────────────────────────

  describe("refund", () => {
    const paidSession = {
      id: "cs_paid",
      payment_status: "paid",
      payment_intent: "pi_001",
      status: "complete",
      amount_total: 20000,
      currency: "aed",
    };

    it("creates a full refund and returns structured result", async () => {
      mockRetrieve.mockResolvedValue(paidSession);
      mockRefund.mockResolvedValue({ id: "re_001", status: "succeeded", amount: 10000 });

      const result = await provider.refund("cs_paid", { amount: 100, reason: "customer_request" });
      expect(result.refundId).toBe("re_001");
      expect(result.status).toBe("succeeded");
      expect(result.amount).toBe(100);
    });

    it("throws 400 when session has no payment_intent", async () => {
      mockRetrieve.mockResolvedValue({ ...paidSession, payment_intent: null });

      await expect(provider.refund("cs_paid", { amount: 100 })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("payment intent"),
      });
    });

    it("sends amount in cents to stripe", async () => {
      mockRetrieve.mockResolvedValue(paidSession);
      mockRefund.mockResolvedValue({ id: "re_002", status: "succeeded", amount: 5000 });

      await provider.refund("cs_paid", { amount: 50 });

      const call = mockRefund.mock.calls[0][0];
      expect(call.amount).toBe(5000);
    });

    it("omits amount from refund params when amount not provided", async () => {
      mockRetrieve.mockResolvedValue(paidSession);
      mockRefund.mockResolvedValue({ id: "re_003", status: "succeeded", amount: 20000 });

      await provider.refund("cs_paid", {});

      const call = mockRefund.mock.calls[0][0];
      expect(call.amount).toBeUndefined();
    });

    it("throws structured error on refund API failure", async () => {
      mockRetrieve.mockResolvedValue(paidSession);
      mockRefund.mockRejectedValue({ statusCode: 400, message: "Already refunded" });

      await expect(provider.refund("cs_paid", { amount: 100 })).rejects.toMatchObject({
        status: 400,
        message: "Already refunded",
      });
    });
  });

  // ─── cancelCheckout ──────────────────────────────────────────────────────────

  describe("cancelCheckout", () => {
    it("resolves without error on success", async () => {
      mockExpire.mockResolvedValue({});
      await expect(provider.cancelCheckout("cs_open")).resolves.toBeUndefined();
    });

    it("throws structured error on failure", async () => {
      mockExpire.mockRejectedValue({ statusCode: 400, message: "Session already expired" });
      await expect(provider.cancelCheckout("cs_expired")).rejects.toMatchObject({
        status: 400,
        message: "Session already expired",
      });
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────────────────────

  describe("handleWebhook", () => {
    const headers = { "stripe-signature": "sig_test" };

    it("normalizes checkout.session.completed to payment.success", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: { object: { id: "cs_001" } },
      });

      const result = await provider.handleWebhook(Buffer.from("{}"), headers);
      expect(result.event).toBe("payment.success");
      expect(result.status).toBe("paid");
      expect(result.sessionId).toBe("cs_001");
    });

    it("normalizes checkout.session.expired to payment.expired", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.expired",
        data: { object: { id: "cs_002" } },
      });

      const result = await provider.handleWebhook(Buffer.from("{}"), headers);
      expect(result.event).toBe("payment.expired");
      expect(result.status).toBe("expired");
    });

    it("normalizes charge.refunded to refund.completed", async () => {
      mockConstructEvent.mockReturnValue({
        type: "charge.refunded",
        data: { object: { id: "ch_001" } },
      });

      const result = await provider.handleWebhook(Buffer.from("{}"), headers);
      expect(result.event).toBe("refund.completed");
      expect(result.status).toBe("refunded");
    });

    it("returns unknown for unrecognized event types", async () => {
      mockConstructEvent.mockReturnValue({
        type: "payment_intent.created",
        data: { object: { id: "pi_001" } },
      });

      const result = await provider.handleWebhook(Buffer.from("{}"), headers);
      expect(result.event).toBe("unknown");
    });

    it("throws 400 on signature mismatch", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Webhook signature verification failed");
      });

      await expect(provider.handleWebhook(Buffer.from("{}"), headers)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("signature"),
      });
    });
  });
});
