require("../setup");
const mongoose = require("mongoose");
const NewsLetter = require("../../src/models/NewsLetter");

// Mock external dependencies
jest.mock("axios");
jest.mock("../../src/mail/emailService", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/utilities/emailHelper", () => ({
  getAdminEmail: jest.fn().mockResolvedValue("admin@test.com"),
}));
jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn((opts, cb) => cb(null, { response: "OK" })),
    close: jest.fn(),
  }),
}));

const newsletterService = require("../../src/services/newsletterService");

describe("newsletterService", () => {
  // ── getSubscribers ────────────────────────────────────────────

  describe("getSubscribers", () => {
    it("should return empty array initially", async () => {
      const result = await newsletterService.getSubscribers();
      expect(result).toEqual([]);
    });

    it("should return subscribers after insertion", async () => {
      await NewsLetter.create({ email: "a@test.com" });
      await NewsLetter.create({ email: "b@test.com" });

      const result = await newsletterService.getSubscribers();

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe("a@test.com");
      expect(result[1].email).toBe("b@test.com");
    });
  });

  // ── subscribe ─────────────────────────────────────────────────

  describe("subscribe", () => {
    it("should throw 400 when email is missing", async () => {
      try {
        await newsletterService.subscribe(null, "some-token");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/email is required/i);
      }
    });

    it("should throw 400 when email is empty string", async () => {
      try {
        await newsletterService.subscribe("", "some-token");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/email is required/i);
      }
    });

    it("should throw 400 when recaptchaToken is missing", async () => {
      try {
        await newsletterService.subscribe("test@example.com", null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/recaptcha/i);
      }
    });
  });

  // ── sendBulkEmails ────────────────────────────────────────────

  describe("sendBulkEmails", () => {
    it("should throw 400 when emails are missing", async () => {
      try {
        await newsletterService.sendBulkEmails({
          subject: "Test",
          htmlContent: "<p>Hello</p>",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/missing required/i);
      }
    });

    it("should throw 400 when subject is missing", async () => {
      try {
        await newsletterService.sendBulkEmails({
          emails: ["a@test.com"],
          htmlContent: "<p>Hello</p>",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/missing required/i);
      }
    });

    it("should throw 400 when htmlContent is missing", async () => {
      try {
        await newsletterService.sendBulkEmails({
          emails: ["a@test.com"],
          subject: "Test",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/missing required/i);
      }
    });

    it("should send emails successfully", async () => {
      const result = await newsletterService.sendBulkEmails({
        emails: ["a@test.com", "b@test.com"],
        subject: "Newsletter",
        htmlContent: "<p>Hello World</p>",
      });

      expect(result.message).toMatch(/sent successfully/i);
    });

    it("should send emails with cc and bcc", async () => {
      const result = await newsletterService.sendBulkEmails({
        emails: ["main@test.com"],
        subject: "Newsletter CC",
        htmlContent: "<p>Hello CC</p>",
        cc: ["cc@test.com"],
        bcc: ["bcc@test.com"],
      });

      expect(result.message).toMatch(/sent successfully/i);
    });
  });

  // ── subscribe (with mocked reCAPTCHA) ──────────────────────────

  describe("subscribe - with valid reCAPTCHA", () => {
    it("should subscribe with valid email and token", async () => {
      // Set up required env vars
      process.env.RECAPTCHA_API_KEY = "fake-recaptcha-api-key";
      process.env.GOOGLE_CLOUD_PROJECT_ID = "fake-project-id";
      process.env.RECAPTCHA_SITE_KEY = "fake-site-key";

      const axios = require("axios");
      // Mock reCAPTCHA verification
      axios.post.mockResolvedValueOnce({
        data: {
          tokenProperties: {
            valid: true,
            action: "newsletter_subscribe",
          },
          riskAnalysis: {
            score: 0.9,
          },
        },
      });

      const result = await newsletterService.subscribe(
        "newsubscriber@test.com",
        "valid-recaptcha-token"
      );

      expect(result.message).toMatch(/thank you/i);

      const saved = await NewsLetter.findOne({ email: "newsubscriber@test.com" });
      expect(saved).not.toBeNull();
    });

    it("should throw when already subscribed", async () => {
      process.env.RECAPTCHA_API_KEY = "fake-recaptcha-api-key";
      process.env.GOOGLE_CLOUD_PROJECT_ID = "fake-project-id";
      process.env.RECAPTCHA_SITE_KEY = "fake-site-key";

      await NewsLetter.create({ email: "existing@test.com" });

      const axios = require("axios");
      axios.post.mockResolvedValueOnce({
        data: {
          tokenProperties: {
            valid: true,
            action: "newsletter_subscribe",
          },
          riskAnalysis: {
            score: 0.9,
          },
        },
      });

      try {
        await newsletterService.subscribe("existing@test.com", "valid-token");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already subscribed/i);
      }
    });

    it("should throw 403 when reCAPTCHA token is invalid", async () => {
      process.env.RECAPTCHA_API_KEY = "fake-recaptcha-api-key";
      process.env.GOOGLE_CLOUD_PROJECT_ID = "fake-project-id";
      process.env.RECAPTCHA_SITE_KEY = "fake-site-key";

      const axios = require("axios");
      axios.post.mockResolvedValueOnce({
        data: {
          tokenProperties: {
            valid: false,
            invalidReason: "EXPIRED",
          },
        },
      });

      try {
        await newsletterService.subscribe("test@test.com", "invalid-token");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.message).toMatch(/verification failed/i);
      }
    });

    it("should throw 403 when reCAPTCHA score is too low", async () => {
      process.env.RECAPTCHA_API_KEY = "fake-recaptcha-api-key";
      process.env.GOOGLE_CLOUD_PROJECT_ID = "fake-project-id";
      process.env.RECAPTCHA_SITE_KEY = "fake-site-key";

      const axios = require("axios");
      axios.post.mockResolvedValueOnce({
        data: {
          tokenProperties: {
            valid: true,
            action: "newsletter_subscribe",
          },
          riskAnalysis: {
            score: 0.1,
          },
        },
      });

      try {
        await newsletterService.subscribe("lowscore@test.com", "valid-token");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.message).toMatch(/suspicious activity/i);
      }
    });
  });
});
