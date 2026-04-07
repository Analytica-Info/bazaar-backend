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
  });
});
