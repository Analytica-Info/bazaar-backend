process.env.STRIPE_SK = "sk_test_fake";
process.env.NOMOD_API_KEY = "test-nomod-key";

jest.mock("stripe", () => jest.fn().mockReturnValue({}));
jest.mock("axios", () => ({ create: jest.fn().mockReturnValue({}) }));

const PaymentProviderFactory = require("../../src/services/payments/PaymentProviderFactory");
const StripeProvider = require("../../src/services/payments/StripeProvider");
const NomodProvider = require("../../src/services/payments/NomodProvider");

describe("PaymentProviderFactory", () => {
  const originalEnv = process.env.PAYMENT_PROVIDER;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PAYMENT_PROVIDER = originalEnv;
    } else {
      delete process.env.PAYMENT_PROVIDER;
    }
  });

  describe("create", () => {
    it("creates a StripeProvider when name is 'stripe'", () => {
      const provider = PaymentProviderFactory.create("stripe");
      expect(provider).toBeInstanceOf(StripeProvider);
    });

    it("creates a NomodProvider when name is 'nomod'", () => {
      const provider = PaymentProviderFactory.create("nomod");
      expect(provider).toBeInstanceOf(NomodProvider);
    });

    it("is case-insensitive — 'Stripe' resolves to StripeProvider", () => {
      const provider = PaymentProviderFactory.create("Stripe");
      expect(provider).toBeInstanceOf(StripeProvider);
    });

    it("is case-insensitive — 'NOMOD' resolves to NomodProvider", () => {
      const provider = PaymentProviderFactory.create("NOMOD");
      expect(provider).toBeInstanceOf(NomodProvider);
    });

    it("throws for unknown provider name", () => {
      expect(() => PaymentProviderFactory.create("tabby")).toThrow(
        /Unknown payment provider "tabby"/
      );
    });

    it("uses PAYMENT_PROVIDER env when no name passed", () => {
      process.env.PAYMENT_PROVIDER = "nomod";
      const provider = PaymentProviderFactory.create();
      expect(provider).toBeInstanceOf(NomodProvider);
    });

    it("defaults to stripe when no name or env set", () => {
      delete process.env.PAYMENT_PROVIDER;
      const provider = PaymentProviderFactory.create();
      expect(provider).toBeInstanceOf(StripeProvider);
    });

    it("error message lists available providers", () => {
      expect(() => PaymentProviderFactory.create("unknown")).toThrow(/stripe.*nomod|nomod.*stripe/);
    });
  });

  describe("available", () => {
    it("returns stripe and nomod", () => {
      const list = PaymentProviderFactory.available();
      expect(list).toContain("stripe");
      expect(list).toContain("nomod");
    });

    it("returns an array", () => {
      expect(Array.isArray(PaymentProviderFactory.available())).toBe(true);
    });
  });
});
