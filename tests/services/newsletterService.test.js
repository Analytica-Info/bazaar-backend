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
  });
});
