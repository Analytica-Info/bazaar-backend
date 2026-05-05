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

  describe("updateBanner", () => {
    it("should update name only (no filePath)", async () => {
      const banner = await bannerService.createBanner("Old Name", "uploads/old.jpg");
      const updated = await bannerService.updateBanner(banner._id.toString(), "New Name", null);
      expect(updated.name).toBe("New Name");
      expect(updated.image).toBe("http://localhost:3000/uploads/old.jpg");
    });

    it("should update image when filePath provided (old file doesn't exist on disk)", async () => {
      const banner = await bannerService.createBanner("My Banner", "uploads/img.jpg");
      const updated = await bannerService.updateBanner(banner._id.toString(), null, "uploads/new.jpg");
      expect(updated.image).toBe("http://localhost:3000/uploads/new.jpg");
    });

    it("should throw 404 when banner not found", async () => {
      const mongoose = require("mongoose");
      const fakeId = new mongoose.Types.ObjectId().toString();
      try {
        await bannerService.updateBanner(fakeId, "Name", null);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  describe("deleteBanner", () => {
    it("should delete banner by id", async () => {
      const banner = await bannerService.createBanner("Del Banner", "uploads/del.jpg");
      await bannerService.deleteBanner(banner._id.toString());
      const found = await BannerImages.findById(banner._id);
      expect(found).toBeNull();
    });

    it("should throw 404 when banner not found", async () => {
      const mongoose = require("mongoose");
      const fakeId = new mongoose.Types.ObjectId().toString();
      try {
        await bannerService.deleteBanner(fakeId);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });
});
