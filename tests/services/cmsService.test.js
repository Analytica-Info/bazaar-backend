require("../setup");
const mongoose = require("mongoose");
const ContactCms = require("../../src/models/ContactCms");
const FeaturesCms = require("../../src/models/FeaturesCms");
const CouponCms = require("../../src/models/CouponCms");

// Mock file-system helpers used by CMS update functions with file uploads
jest.mock("../../src/utils/deleteOldFile", () => jest.fn());

const cmsService = require("../../src/services/cmsService");

describe("cmsService", () => {
  // ── getCmsData ────────────────────────────────────────────────

  describe("getCmsData", () => {
    it("should return all CMS sections as null when DB is empty", async () => {
      const result = await cmsService.getCmsData();

      expect(result).toBeDefined();
      expect(result.couponCmsData).toBeNull();
      expect(result.headerInfoCmsData).toBeNull();
      expect(result.sliderCmsData).toBeNull();
      expect(result.featuresCmsData).toBeNull();
      expect(result.offersCmsData).toBeNull();
      expect(result.categoryImagesCmsData).toBeNull();
      expect(result.offerFilterCmsData).toBeNull();
      expect(result.footerInfoCmsData).toBeNull();
      expect(result.aboutCmsData).toBeNull();
      expect(result.shopCmsData).toBeNull();
      expect(result.contactCmsData).toBeNull();
      expect(result.brandsLogoCmsData).toBeNull();
    });
  });

  // ── getCouponCms ──────────────────────────────────────────────

  describe("getCouponCms", () => {
    it("should throw 404 when no coupon CMS exists", async () => {
      try {
        await cmsService.getCouponCms();
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });

    it("should return coupon CMS data when it exists", async () => {
      await CouponCms.create({
        logo: "http://logo.test/logo.png",
        mrBazaarLogo: "http://logo.test/mr.png",
        discountText: "10% OFF",
        discountTextExtra: "Extra savings",
        description: "Test description",
        facebookLink: "http://fb.com",
        instagramLink: "http://ig.com",
        tikTokLink: "http://tiktok.com",
        youtubeLink: "http://yt.com",
      });

      const result = await cmsService.getCouponCms();

      expect(result.couponCmsData).toBeDefined();
      expect(result.couponCmsData.discountText).toBe("10% OFF");
    });
  });

  // ── updateContact ─────────────────────────────────────────────

  describe("updateContact", () => {
    const contactData = {
      tagLine: "Best Deals",
      address: "123 Test St",
      email: "contact@test.com",
      phone: "+971501234567",
      facebook: "http://fb.com/bazaar",
      tiktok: "http://tiktok.com/bazaar",
      instagram: "http://ig.com/bazaar",
    };

    it("should create contact CMS data when none exists", async () => {
      const result = await cmsService.updateContact(contactData);

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await ContactCms.findOne();
      expect(saved).not.toBeNull();
      expect(saved.tagLine).toBe("Best Deals");
      expect(saved.email).toBe("contact@test.com");
    });

    it("should update existing contact CMS data", async () => {
      await ContactCms.create(contactData);

      const updated = {
        ...contactData,
        tagLine: "Updated Tagline",
        phone: "+971509999999",
      };

      const result = await cmsService.updateContact(updated);

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await ContactCms.findOne();
      expect(saved.tagLine).toBe("Updated Tagline");
      expect(saved.phone).toBe("+971509999999");
    });
  });

  // ── updateFeatures ────────────────────────────────────────────

  describe("updateFeatures", () => {
    it("should create features CMS data", async () => {
      const data = {
        features: [
          { title: "Free Shipping", paragraph: "On all orders" },
          { title: "24/7 Support", paragraph: "Always available" },
        ],
      };

      const result = await cmsService.updateFeatures(data);

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await FeaturesCms.findOne();
      expect(saved).not.toBeNull();
      expect(saved.featureData).toHaveLength(2);
      expect(saved.featureData[0].title).toBe("Free Shipping");
    });

    it("should update existing features CMS data", async () => {
      await FeaturesCms.create({
        featureData: [{ title: "Old Feature", paragraph: "Old text" }],
      });

      const data = {
        features: [
          { title: "New Feature 1", paragraph: "New text 1" },
          { title: "New Feature 2", paragraph: "New text 2" },
          { title: "New Feature 3", paragraph: "New text 3" },
        ],
      };

      const result = await cmsService.updateFeatures(data);
      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await FeaturesCms.findOne();
      expect(saved.featureData).toHaveLength(3);
      expect(saved.featureData[0].title).toBe("New Feature 1");
    });

    it("should throw 400 when features is not an array", async () => {
      try {
        await cmsService.updateFeatures({ features: "not-an-array" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/must be an array/i);
      }
    });
  });
});
