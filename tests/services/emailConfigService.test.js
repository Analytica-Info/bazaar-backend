require("../setup");
const emailConfigService = require("../../src/services/emailConfigService");
const EmailConfig = require("../../src/models/EmailConfig");

describe("emailConfigService", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getConfig", () => {
    it("should create config from env when none exists", async () => {
      process.env.ADMIN_EMAIL = "admin@test.com";
      process.env.CC_MAILS = "cc1@test.com,cc2@test.com";

      const config = await emailConfigService.getConfig();

      expect(config.adminEmail).toBe("admin@test.com");
      expect(config.ccEmails).toEqual(["cc1@test.com", "cc2@test.com"]);
      expect(config.isActive).toBe(true);
    });

    it("should return existing config", async () => {
      await EmailConfig.create({
        adminEmail: "existing@test.com",
        ccEmails: ["cc@test.com"],
        isActive: true,
      });

      const config = await emailConfigService.getConfig();
      expect(config.adminEmail).toBe("existing@test.com");
    });
  });

  describe("updateConfig", () => {
    it("should throw on invalid email format", async () => {
      try {
        await emailConfigService.updateConfig({ adminEmail: "not-an-email" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid/i);
      }
    });

    it("should throw when adminEmail is missing", async () => {
      try {
        await emailConfigService.updateConfig({});
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });
  });
});
