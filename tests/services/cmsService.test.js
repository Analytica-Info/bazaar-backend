require("../setup");
const mongoose = require("mongoose");
const ContactCms = require("../../src/models/ContactCms");
const FeaturesCms = require("../../src/models/FeaturesCms");
const CouponCms = require("../../src/models/CouponCms");
const SliderCms = require("../../src/models/SliderCms");
const HeaderInfoCms = require("../../src/models/HeaderInfo");
const FooterInfoCms = require("../../src/models/FooterInfoCms");
const OffersCms = require("../../src/models/OffersCms");
const AboutCms = require("../../src/models/About");

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

  // ── updateSlider ────────────────────────────────────────────────

  describe("updateSlider", () => {
    it("should create slider CMS when none exists", async () => {
      const files = {
        sliderImage1: { filename: "slide1.jpg" },
        sliderImage2: { filename: "slide2.jpg" },
        sliderImage3: { filename: "slide3.jpg" },
      };

      const result = await cmsService.updateSlider({}, files);

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await SliderCms.findOne();
      expect(saved).not.toBeNull();
      expect(saved.sliderImage1).toContain("slide1.jpg");
      expect(saved.sliderImage2).toContain("slide2.jpg");
      expect(saved.sliderImage3).toContain("slide3.jpg");
    });

    it("should update existing slider images", async () => {
      await SliderCms.create({
        sliderImage1: "http://old/1.jpg",
        sliderImage2: "http://old/2.jpg",
        sliderImage3: "http://old/3.jpg",
      });

      const files = {
        sliderImage1: { filename: "new-slide1.jpg" },
      };

      const result = await cmsService.updateSlider({}, files);
      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await SliderCms.findOne();
      expect(saved.sliderImage1).toContain("new-slide1.jpg");
      // Other images should remain unchanged
      expect(saved.sliderImage2).toBe("http://old/2.jpg");
    });
  });

  // ── updateHeader ────────────────────────────────────────────────

  describe("updateHeader", () => {
    it("should create header info when none exists", async () => {
      const files = { logo: { filename: "logo.png" } };
      const data = { contactNumber: "+971501234567" };

      const result = await cmsService.updateHeader(data, files);

      expect(result.message).toMatch(/saved successfully/i);

      const saved = await HeaderInfoCms.findOne();
      expect(saved).not.toBeNull();
      expect(saved.contactNumber).toBe("+971501234567");
      expect(saved.logo).toContain("logo.png");
    });

    it("should update existing header info", async () => {
      await HeaderInfoCms.create({
        logo: "http://old/logo.png",
        contactNumber: "+971500000000",
      });

      const result = await cmsService.updateHeader(
        { contactNumber: "+971509999999" },
        {}
      );

      expect(result.message).toMatch(/saved successfully/i);

      const saved = await HeaderInfoCms.findOne();
      expect(saved.contactNumber).toBe("+971509999999");
      // Logo unchanged since no file was provided
      expect(saved.logo).toBe("http://old/logo.png");
    });
  });

  // ── updateFooter ────────────────────────────────────────────────

  describe("updateFooter", () => {
    it("should create footer info when none exists", async () => {
      const data = {
        tagLine: "Best Deals",
        address: "123 Street",
        email: "footer@test.com",
        phone: "+971501234567",
        facebook: "http://fb.com",
        tiktok: "http://tiktok.com",
        instagram: "http://ig.com",
        youtube: "http://yt.com",
      };
      const files = { logo: { filename: "footer-logo.png" } };

      const result = await cmsService.updateFooter(data, files);

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await FooterInfoCms.findOne();
      expect(saved).not.toBeNull();
      expect(saved.tagLine).toBe("Best Deals");
      expect(saved.logo).toContain("footer-logo.png");
      expect(saved.youtube).toBe("http://yt.com");
    });

    it("should update existing footer info without file", async () => {
      await FooterInfoCms.create({
        logo: "http://old/logo.png",
        tagLine: "Old Tag",
        address: "Old Addr",
        email: "old@test.com",
        phone: "000",
        facebook: "http://fb.com",
        tiktok: "http://tiktok.com",
        instagram: "http://ig.com",
        youtube: "http://yt.com",
      });

      const result = await cmsService.updateFooter(
        {
          tagLine: "New Tag",
          address: "New Addr",
          email: "new@test.com",
          phone: "111",
          facebook: "http://fb2.com",
          tiktok: "http://tiktok2.com",
          instagram: "http://ig2.com",
          youtube: "http://yt2.com",
        },
        {}
      );

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await FooterInfoCms.findOne();
      expect(saved.tagLine).toBe("New Tag");
      expect(saved.logo).toBe("http://old/logo.png");
    });
  });

  // ── updateOffers ────────────────────────────────────────────────

  describe("updateOffers", () => {
    it("should create offers CMS with images", async () => {
      const data = { offerCategory: ["Electronics", "Home"] };
      const files = {
        offerImages: [
          { filename: "offer1.jpg" },
          { filename: "offer2.jpg" },
        ],
      };

      const result = await cmsService.updateOffers(data, files);

      expect(result.message).toMatch(/updated successfully/i);

      const saved = await OffersCms.findOne();
      expect(saved).not.toBeNull();
      expect(saved.offersData).toHaveLength(2);
      expect(saved.offersData[0].offerImage).toContain("offer1.jpg");
      expect(saved.offersData[0].offerCategory).toBe("Electronics");
    });

    it("should update existing offers", async () => {
      await OffersCms.create({
        offersData: [
          { offerImage: "http://old/1.jpg", offerCategory: "Old" },
        ],
      });

      const data = { offerCategory: ["NewCat"] };
      const files = {
        offerImages: [{ filename: "new-offer.jpg" }],
      };

      const result = await cmsService.updateOffers(data, files);
      expect(result.message).toMatch(/updated successfully/i);

      const saved = await OffersCms.findOne();
      expect(saved.offersData[0].offerImage).toContain("new-offer.jpg");
      expect(saved.offersData[0].offerCategory).toBe("NewCat");
    });
  });

  // ── updateAbout ─────────────────────────────────────────────────

  describe("updateAbout", () => {
    it("should create about CMS with parsed contents", async () => {
      const data = {
        contents: JSON.stringify([
          { title: "Our Story", paragraph: "We started in 2020" },
        ]),
      };
      const files = { backgroundImage: { filename: "about-bg.jpg" } };

      const result = await cmsService.updateAbout(data, files);

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await AboutCms.findOne();
      expect(saved).not.toBeNull();
      expect(saved.contents).toHaveLength(1);
      expect(saved.contents[0].title).toBe("Our Story");
      expect(saved.backgroundImage).toContain("about-bg.jpg");
    });

    it("should throw 400 when contents is invalid JSON", async () => {
      try {
        await cmsService.updateAbout({ contents: "not-valid-json{" }, {});
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid contents format/i);
      }
    });

    it("should update existing about without file", async () => {
      await AboutCms.create({
        backgroundImage: "http://old/bg.jpg",
        contents: [{ title: "Old", paragraph: "Old text" }],
      });

      const result = await cmsService.updateAbout(
        { contents: [{ title: "New", paragraph: "New text" }] },
        {}
      );

      expect(result.message).toMatch(/uploaded successfully/i);

      const saved = await AboutCms.findOne();
      expect(saved.contents[0].title).toBe("New");
      expect(saved.backgroundImage).toBe("http://old/bg.jpg");
    });
  });

  // ── uploadEditorImage ───────────────────────────────────────────

  describe("uploadEditorImage", () => {
    it("should return file URL when path is provided", async () => {
      const result = await cmsService.uploadEditorImage("image123.jpg");

      expect(result.uploaded).toBe(1);
      expect(result.url).toContain("image123.jpg");
      expect(result.url).toContain("EditorBodyImages");
    });

    it("should throw 400 when file path is missing", async () => {
      try {
        await cmsService.uploadEditorImage(null);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/missing required file/i);
      }
    });
  });

  // ── deleteEditorImage ───────────────────────────────────────────

  describe("deleteEditorImage", () => {
    it("should throw 400 when URL is invalid", async () => {
      try {
        await cmsService.deleteEditorImage("not-a-url");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid url/i);
      }
    });

    it("should throw 404 when file does not exist", async () => {
      try {
        await cmsService.deleteEditorImage("http://localhost:3000/uploads/EditorBodyImages/nonexistent.png");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/file not found/i);
      }
    });
  });

  // ── updateCouponCms ──────────────────────────────────────────────────
  describe("updateCouponCms", () => {
    const validCouponData = {
      discountText: "20% OFF",
      discountTextExtra: "use code SAVE20",
      description: "Get 20% off",
      facebookLink: "https://fb.com",
      instagramLink: "https://ig.com",
      tikTokLink: "https://tiktok.com",
      youtubeLink: "https://yt.com",
    };

    it("should create coupon CMS with both logo files provided", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      const result = await cmsService.updateCouponCms(validCouponData, {
        logo: { filename: "logo.png" },
        mrBazaarLogo: { filename: "mr-logo.png" },
      });

      expect(result.message).toMatch(/success/i);

      const CouponCms = require("../../src/models/CouponCms");
      const saved = await CouponCms.findOne();
      expect(saved.discountText).toBe("20% OFF");
      expect(saved.logo).toContain("logo.png");
      expect(saved.mrBazaarLogo).toContain("mr-logo.png");
    });

    it("should update existing coupon CMS", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";
      const CouponCms = require("../../src/models/CouponCms");
      await CouponCms.create({
        ...validCouponData,
        logo: "http://localhost:3000/logo.png",
        mrBazaarLogo: "http://localhost:3000/mr.png",
      });

      await cmsService.updateCouponCms(
        { ...validCouponData, discountText: "New Text" },
        {
          logo: { filename: "logo2.png" },
          mrBazaarLogo: { filename: "mr2.png" },
        }
      );

      const updated = await CouponCms.findOne();
      expect(updated.discountText).toBe("New Text");
    });

    it("should append cache-busting query when logo file is provided", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      await cmsService.updateCouponCms(validCouponData, {
        logo: { filename: "logo3.png" },
        mrBazaarLogo: { filename: "mr3.png" },
      });

      const CouponCms = require("../../src/models/CouponCms");
      const saved = await CouponCms.findOne();
      expect(saved.logo).toContain("?v=");
    });
  });

  // ── updateShop ─────────────────────────────────────────────────────
  describe("updateShop", () => {
    it("should create shop CMS when both image files are provided", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      const result = await cmsService.updateShop(
        {},
        { Image1: { filename: "shop1.jpg" }, Image2: { filename: "shop2.jpg" } }
      );
      expect(result.message).toBeDefined();
    });

    it("should update existing shop CMS Image1", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      const ShopCms = require("../../src/models/Shop");
      await ShopCms.create({
        Image1: "http://localhost:3000/old1.jpg",
        Image2: "http://localhost:3000/old2.jpg",
      });

      await cmsService.updateShop({}, { Image1: { filename: "new1.jpg" } });

      const saved = await ShopCms.findOne();
      expect(saved.Image1).toContain("new1.jpg");
    });
  });

  // ── updateBrandsLogo ──────────────────────────────────────────────
  describe("updateBrandsLogo", () => {
    it("should create brands logo CMS when none exists", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      const result = await cmsService.updateBrandsLogo(
        {},
        { logo0: { filename: "brand0.png" }, logo1: { filename: "brand1.png" } }
      );

      expect(result.message).toBeDefined();

      const BrandsLogoCms = require("../../src/models/BrandsLogo");
      const saved = await BrandsLogoCms.findOne();
      expect(saved.images[0]).toContain("brand0.png");
      expect(saved.images[1]).toContain("brand1.png");
    });

    it("should add to existing images array without overwriting untouched slots", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      const BrandsLogoCms = require("../../src/models/BrandsLogo");
      await BrandsLogoCms.create({ images: ["http://old.com/img0.png"] });

      await cmsService.updateBrandsLogo({}, { logo2: { filename: "brand2.png" } });

      const saved = await BrandsLogoCms.findOne();
      expect(saved.images[0]).toBe("http://old.com/img0.png");
      expect(saved.images[2]).toContain("brand2.png");
    });
  });

  // ── updateCategoryImages ─────────────────────────────────────────
  describe("updateCategoryImages", () => {
    it("should update category images when existing record is present", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      const CategoriesCms = require("../../src/models/CategoriesCms");
      // Seed a record with all required fields so upsert path updates rather than create
      await CategoriesCms.create({
        Electronics: "http://localhost:3000/elec_old.jpg",
        Home: "http://localhost:3000/home_old.jpg",
        Sports: "http://localhost:3000/sports_old.jpg",
        Toys: "http://localhost:3000/toys_old.jpg",
        Home_Improvement: "http://localhost:3000/home_imp_old.jpg",
      });

      const result = await cmsService.updateCategoryImages(
        {},
        { Electronics: { filename: "elec_new.jpg" } }
      );
      expect(result.message).toBeDefined();

      const saved = await CategoriesCms.findOne();
      expect(saved.Electronics).toContain("elec_new.jpg");
    });
  });

  // ── updateOfferFilter ────────────────────────────────────────────
  describe("updateOfferFilter", () => {
    it("should create offer filter CMS when valid price range provided", async () => {
      process.env.BACKEND_URL = "http://localhost:3000";

      const result = await cmsService.updateOfferFilter(
        { MinPrice1: "0", MaxPrice1: "100", MinPrice2: "100", MaxPrice2: "500" },
        {}
      );
      expect(result.message).toBeDefined();
    });

    it("should throw 400 when MinPrice > MaxPrice", async () => {
      try {
        await cmsService.updateOfferFilter(
          { MinPrice1: "200", MaxPrice1: "100", MinPrice2: "0", MaxPrice2: "500" },
          {}
        );
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid price/i);
      }
    });
  });

  // ── invalidateCmsCache ───────────────────────────────────────────
  describe("invalidateCmsCache", () => {
    it("should run without error", async () => {
      await expect(cmsService.invalidateCmsCache()).resolves.toBeUndefined();
    });
  });
});
