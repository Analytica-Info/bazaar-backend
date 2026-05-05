const PaymentProvider = require("../../src/services/payments/PaymentProvider");

describe("PaymentProvider (base class)", () => {
  let provider;

  beforeEach(() => {
    provider = new PaymentProvider("test-provider");
  });

  it("stores the provider name", () => {
    expect(provider.name).toBe("test-provider");
  });

  it("createCheckout throws not-implemented", async () => {
    await expect(provider.createCheckout({})).rejects.toThrow("test-provider: createCheckout() not implemented");
  });

  it("getCheckout throws not-implemented", async () => {
    await expect(provider.getCheckout("id")).rejects.toThrow("test-provider: getCheckout() not implemented");
  });

  it("refund throws not-implemented", async () => {
    await expect(provider.refund("id", {})).rejects.toThrow("test-provider: refund() not implemented");
  });

  it("cancelCheckout throws not-implemented", async () => {
    await expect(provider.cancelCheckout("id")).rejects.toThrow("test-provider: cancelCheckout() not implemented");
  });

  it("handleWebhook throws not-implemented", async () => {
    await expect(provider.handleWebhook({}, {})).rejects.toThrow("test-provider: handleWebhook() not implemented");
  });
});
