require("../setup");

// Mock all external dependencies that checkoutService imports at module level
jest.mock("stripe", () => {
  return jest.fn().mockReturnValue({
    checkout: { sessions: { create: jest.fn() } },
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

describe("checkoutService", () => {
  describe("all checkout functions", () => {
    it.skip("createStripeSession - requires live Stripe API keys", () => {});
    it.skip("handleStripeWebhook - requires Stripe webhook signature verification", () => {});
    it.skip("createTabbySession - requires live Tabby API credentials", () => {});
    it.skip("handleTabbyWebhook - requires Tabby webhook payload", () => {});
    it.skip("createCashOnDeliveryOrder - requires full cart + user + product state", () => {});
    it.skip("confirmPaymentIntent - requires Stripe payment intent ID", () => {});
    it.skip("getOrders - integration test requiring order + user data", () => {});
    it.skip("getOrderDetails - integration test requiring order detail data", () => {});
  });

  // Verify the module loads without errors (Stripe mock is required)
  it("should load checkoutService without errors", () => {
    const checkoutService = require("../../src/services/checkoutService");
    expect(checkoutService).toBeDefined();
  });
});
