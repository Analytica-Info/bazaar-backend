require("../setup");
const bannerService = require("../../src/services/bannerService");
const { BannerImages } = require("../../src/models/BannerImages");

describe("bannerService", () => {
  beforeEach(() => {
    process.env.FRONTEND_BASE_URL = "http://localhost:3000";
  });

  describe("getAllBanners", () => {
    it("should return empty array when no banners exist", async () => {
      const result = await bannerService.getAllBanners();
      expect(result).toEqual([]);
    });
  });

  describe("createBanner", () => {
    it("should create and return a banner", async () => {
      const banner = await bannerService.createBanner("Hero Banner", "uploads/hero.jpg");

      expect(banner.name).toBe("Hero Banner");
      expect(banner.image).toBe("http://localhost:3000/uploads/hero.jpg");

      const saved = await BannerImages.findById(banner._id);
      expect(saved).not.toBeNull();
    });

    it("should throw on duplicate name", async () => {
      await bannerService.createBanner("Hero Banner", "uploads/hero.jpg");

      try {
        await bannerService.createBanner("Hero Banner", "uploads/hero2.jpg");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already exists/i);
      }
    });

    it("should throw when name is missing", async () => {
      try {
        await bannerService.createBanner(undefined, "uploads/hero.jpg");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });
  });
});
