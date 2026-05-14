require("../setup");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Contact = require("../../src/models/Contact");
const ActivityLog = require("../../src/models/ActivityLog");

// Mock external dependencies (email API, SMTP, axios for email validation)
jest.mock("../../src/mail/emailService", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("axios");

const contactService = require("../../src/services/contactService");

describe("contactService", () => {
  // ---------------------------------------------------------------------------
  // submitContactForm (validation only - full flow requires external email API)
  // ---------------------------------------------------------------------------
  describe("submitContactForm", () => {
    it("should throw when name is missing", async () => {
      try {
        await contactService.submitContactForm({
          email: "test@example.com",
          phone: "123456",
          subject: "Test",
          message: "Hello",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/name is required/i);
      }
    });

    it("should throw when email is missing", async () => {
      try {
        await contactService.submitContactForm({
          name: "John",
          phone: "123456",
          subject: "Test",
          message: "Hello",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/email is required/i);
      }
    });

    it("should throw when phone is missing", async () => {
      try {
        await contactService.submitContactForm({
          name: "John",
          email: "test@example.com",
          subject: "Test",
          message: "Hello",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/phone is required/i);
      }
    });

    it("should throw when subject is missing", async () => {
      try {
        await contactService.submitContactForm({
          name: "John",
          email: "test@example.com",
          phone: "123456",
          message: "Hello",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/subject is required/i);
      }
    });

    it("should throw when message is missing", async () => {
      try {
        await contactService.submitContactForm({
          name: "John",
          email: "test@example.com",
          phone: "123456",
          subject: "Test",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/message is required/i);
      }
    });

    it("should submit form and save contact when email is valid", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: {
          deliverability: "DELIVERABLE",
          is_disposable_email: { value: false },
        },
      });

      const result = await contactService.submitContactForm({
        name: "Valid User",
        email: "valid@example.com",
        phone: "0501234567",
        subject: "Test Subject",
        message: "Hello there",
      });

      expect(result).toMatch(/thank you/i);

      const saved = await Contact.findOne({ email: "valid@example.com" });
      expect(saved).not.toBeNull();
      expect(saved.name).toBe("Valid User");
      expect(saved.subject).toBe("Test Subject");
    });

    it("should throw when email validation fails", async () => {
      const axios = require("axios");
      axios.get.mockResolvedValueOnce({
        data: {
          deliverability: "UNDELIVERABLE",
          is_disposable_email: { value: false },
        },
      });

      try {
        await contactService.submitContactForm({
          name: "Bad Email User",
          email: "bad@invalid.com",
          phone: "0501234567",
          subject: "Test",
          message: "Hello",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/not valid/i);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // createMobileAppLog
  // ---------------------------------------------------------------------------
  describe("createMobileAppLog", () => {
    it("should throw when user_name is missing", async () => {
      try {
        await contactService.createMobileAppLog({
          mobile_device: "iPhone 15",
          app_version: "1.0.0",
          email: "user@test.com",
          issue_message: "App crashes",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/user name is required/i);
      }
    });

    it("should throw when mobile_device is missing", async () => {
      try {
        await contactService.createMobileAppLog({
          user_name: "John",
          app_version: "1.0.0",
          email: "user@test.com",
          issue_message: "App crashes",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/mobile device is required/i);
      }
    });

    it("should throw when app_version is missing", async () => {
      try {
        await contactService.createMobileAppLog({
          user_name: "John",
          mobile_device: "iPhone 15",
          email: "user@test.com",
          issue_message: "App crashes",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/app version is required/i);
      }
    });

    it("should throw when email is missing", async () => {
      try {
        await contactService.createMobileAppLog({
          user_name: "John",
          mobile_device: "iPhone 15",
          app_version: "1.0.0",
          issue_message: "App crashes",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/email is required/i);
      }
    });

    it("should throw when issue_message is missing", async () => {
      try {
        await contactService.createMobileAppLog({
          user_name: "John",
          mobile_device: "iPhone 15",
          app_version: "1.0.0",
          email: "user@test.com",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/issue\/message is required/i);
      }
    });

    it("should create a log entry with valid data", async () => {
      const result = await contactService.createMobileAppLog({
        user_name: "John Doe",
        mobile_device: "iPhone 15",
        app_version: "2.1.0",
        email: "john@test.com",
        issue_message: "App crashes on checkout",
        activity_name: "Checkout Error",
      });

      expect(result.logId).toBeDefined();

      const log = await ActivityLog.findById(result.logId);
      expect(log).not.toBeNull();
      expect(log.platform).toBe("Mobile App Frontend");
      expect(log.log_type).toBe("frontend_log");
      expect(log.user_name).toBe("John Doe");
      expect(log.mobile_device).toBe("iPhone 15");
      expect(log.app_version).toBe("2.1.0");
      expect(log.issue_message).toBe("App crashes on checkout");
    });

    it("should create log with all fields and verify ActivityLog fields", async () => {
      const result = await contactService.createMobileAppLog({
        user_name: "Jane Smith",
        mobile_device: "Samsung Galaxy S24",
        app_version: "3.0.1",
        email: "jane@test.com",
        issue_message: "Payment failed unexpectedly",
        activity_name: "Payment Error",
      });

      const log = await ActivityLog.findById(result.logId);
      expect(log.action).toBe("Payment Error");
      expect(log.status).toBe("success");
      expect(log.message).toContain("Jane Smith");
      expect(log.user_email).toBe("jane@test.com");
      expect(log.timestamp).toBeDefined();
      expect(log.details).toBeDefined();
      expect(log.details.mobile_device).toBe("Samsung Galaxy S24");
      expect(log.details.app_version).toBe("3.0.1");
      expect(log.details.activity_name).toBe("Payment Error");
      expect(log.details.dubai_datetime).toBeDefined();
    });

    it("should use default action when activity_name is not provided", async () => {
      const result = await contactService.createMobileAppLog({
        user_name: "No Activity",
        mobile_device: "Pixel 8",
        app_version: "1.0.0",
        email: "noact@test.com",
        issue_message: "General issue",
      });

      const log = await ActivityLog.findById(result.logId);
      expect(log.action).toBe("User Issue/Message");
    });
  });

  // ---------------------------------------------------------------------------
  // downloadFile
  // ---------------------------------------------------------------------------
  describe("downloadFile", () => {
    it("should throw when path is missing", () => {
      try {
        contactService.downloadFile(null, "/tmp/uploads");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/missing file path/i);
      }
    });

    it("should throw when path traversal is detected", () => {
      try {
        contactService.downloadFile("../../etc/passwd", "/tmp/uploads");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.message).toMatch(/access denied/i);
      }
    });

    it("should throw when file does not exist", () => {
      const uploadsDir = path.join("/tmp", "test-uploads-" + Date.now());
      fs.mkdirSync(uploadsDir, { recursive: true });

      try {
        contactService.downloadFile("nonexistent.pdf", uploadsDir);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/file not found/i);
      }

      fs.rmdirSync(uploadsDir);
    });

    it("should return full path for a valid file", () => {
      const uploadsDir = path.join("/tmp", "test-uploads-" + Date.now());
      fs.mkdirSync(uploadsDir, { recursive: true });
      const testFile = path.join(uploadsDir, "report.pdf");
      fs.writeFileSync(testFile, "dummy content");

      const result = contactService.downloadFile("report.pdf", uploadsDir);
      expect(result).toBe(testFile);

      // Cleanup
      fs.unlinkSync(testFile);
      fs.rmdirSync(uploadsDir);
    });

    it("should return correct full path for nested valid file", () => {
      const uploadsDir = path.join("/tmp", "test-uploads-nested-" + Date.now());
      const subDir = path.join(uploadsDir, "docs");
      fs.mkdirSync(subDir, { recursive: true });
      const testFile = path.join(subDir, "invoice.pdf");
      fs.writeFileSync(testFile, "invoice content");

      const result = contactService.downloadFile("docs/invoice.pdf", uploadsDir);
      expect(result).toBe(testFile);

      // Cleanup
      fs.unlinkSync(testFile);
      fs.rmdirSync(subDir);
      fs.rmdirSync(uploadsDir);
    });

    it("should strip uploads prefix from path", () => {
      const uploadsDir = path.join("/tmp", "test-uploads-strip-" + Date.now());
      fs.mkdirSync(uploadsDir, { recursive: true });
      const testFile = path.join(uploadsDir, "doc.pdf");
      fs.writeFileSync(testFile, "stripped content");

      const result = contactService.downloadFile("/uploads/doc.pdf", uploadsDir);
      expect(result).toBe(testFile);

      // Cleanup
      fs.unlinkSync(testFile);
      fs.rmdirSync(uploadsDir);
    });
  });

  // ---------------------------------------------------------------------------
  // submitFeedback
  // ---------------------------------------------------------------------------
  describe("submitFeedback", () => {
    it("should throw 400 when name is missing", async () => {
      try {
        await contactService.submitFeedback({ feedback: "Great app", userEmail: "u@test.com" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/name is required/i);
      }
    });

    it("should throw 400 when feedback is missing", async () => {
      try {
        await contactService.submitFeedback({ name: "John", userEmail: "u@test.com" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/feedback is required/i);
      }
    });

    it("should throw 400 when userEmail is missing", async () => {
      try {
        await contactService.submitFeedback({ name: "John", feedback: "Good" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/email/i);
      }
    });

    it("should submit feedback successfully with valid data", async () => {
      const result = await contactService.submitFeedback({
        name: "Jane",
        feedback: "Really love the product selection",
        userEmail: "jane@test.com",
      });

      expect(result).toMatch(/thank you/i);
    });
  });

  // ---------------------------------------------------------------------------
  // validateEmail error path (axios throws)
  // ---------------------------------------------------------------------------
  describe("submitContactForm — email validation API failure", () => {
    it("should fall back gracefully when email validation API throws", async () => {
      const axios = require("axios");
      // Simulate a network error from the email validation API
      axios.get.mockRejectedValueOnce(new Error("Network error"));

      try {
        await contactService.submitContactForm({
          name: "Retry User",
          email: "retry@test.com",
          phone: "0501234567",
          subject: "Test",
          message: "Hello",
        });
        fail("Expected error to be thrown");
      } catch (err) {
        // When API fails, email is treated as invalid
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/not valid/i);
      }
    });
  });
});
