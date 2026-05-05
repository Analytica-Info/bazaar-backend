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

    it("should update existing config", async () => {
      await EmailConfig.create({ adminEmail: "old@test.com", ccEmails: [], isActive: true });
      const result = await emailConfigService.updateConfig({ adminEmail: "new@test.com", ccEmails: ["cc@test.com"] });
      expect(result.adminEmail).toBe("new@test.com");
      expect(result.ccEmails).toEqual(["cc@test.com"]);
    });

    it("should create config when none exists", async () => {
      const result = await emailConfigService.updateConfig({ adminEmail: "fresh@test.com" });
      expect(result.adminEmail).toBe("fresh@test.com");
    });

    it("should throw on invalid CC email", async () => {
      try {
        await emailConfigService.updateConfig({ adminEmail: "valid@test.com", ccEmails: ["not-an-email"] });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid/i);
      }
    });
  });

  describe("syncFromEnv", () => {
    it("should create config from env when none exists", async () => {
      process.env.ADMIN_EMAIL = "sync@test.com";
      process.env.CC_MAILS = "a@test.com,b@test.com";
      const result = await emailConfigService.syncFromEnv();
      expect(result.adminEmail).toBe("sync@test.com");
      expect(result.ccEmails).toContain("a@test.com");
    });

    it("should update existing config with env values", async () => {
      await EmailConfig.create({ adminEmail: "old@test.com", ccEmails: [], isActive: true });
      process.env.ADMIN_EMAIL = "updated@test.com";
      process.env.CC_MAILS = "x@test.com";
      const result = await emailConfigService.syncFromEnv();
      expect(result.adminEmail).toBe("updated@test.com");
    });

    it("should preserve existing ccEmails when CC_MAILS is empty", async () => {
      await EmailConfig.create({ adminEmail: "old@test.com", ccEmails: ["keep@test.com"], isActive: true });
      process.env.ADMIN_EMAIL = "old@test.com";
      process.env.CC_MAILS = "";
      const result = await emailConfigService.syncFromEnv();
      expect(result.ccEmails).toContain("keep@test.com");
    });
  });
});
