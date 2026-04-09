require("../setup");
const mongoose = require("mongoose");
const shippingService = require("../../src/services/shippingService");
const ShippingCountry = require("../../src/models/ShippingCountry");

describe("shippingService", () => {
  let uaeId;

  beforeEach(async () => {
    const uae = await ShippingCountry.create({
      name: "United Arab Emirates",
      code: "AE",
      currency: "AED",
      currencySymbol: "AED",
      defaultShippingRate: 30,
      freeShippingThreshold: 200,
      sortOrder: 1,
      isActive: true,
      cities: [
        {
          name: "Dubai",
          shippingRate: 0,
          areas: [
            { name: "Al Barsha", shippingRate: 0 },
            { name: "International City", shippingRate: 5 },
          ],
        },
        {
          name: "Abu Dhabi",
          shippingRate: 10,
          areas: [{ name: "Al Ain", shippingRate: 15 }],
        },
      ],
    });
    uaeId = uae._id.toString();
  });

  // ============================
  // Country CRUD
  // ============================

  describe("listCountries", () => {
    it("should return all countries", async () => {
      const result = await shippingService.listCountries();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe("AE");
    });
  });

  describe("listActiveCountries", () => {
    it("should return only active countries", async () => {
      await ShippingCountry.create({
        name: "Inactive", code: "XX", currency: "XXX", currencySymbol: "X",
        defaultShippingRate: 0, isActive: false,
      });
      const result = await shippingService.listActiveCountries();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe("AE");
    });
  });

  describe("createCountry", () => {
    it("should create a new country", async () => {
      const result = await shippingService.createCountry({
        name: "Oman", code: "OM", currency: "OMR", currencySymbol: "OMR",
        defaultShippingRate: 5,
      });
      expect(result.code).toBe("OM");
      expect(result.currency).toBe("OMR");
    });

    it("should throw on duplicate code", async () => {
      await expect(
        shippingService.createCountry({ name: "UAE2", code: "AE", currency: "AED", currencySymbol: "AED" })
      ).rejects.toMatchObject({ status: 400 });
    });

    it("should throw on missing fields", async () => {
      await expect(
        shippingService.createCountry({ name: "Test" })
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("getCountryById", () => {
    it("should return country by ID", async () => {
      const result = await shippingService.getCountryById(uaeId);
      expect(result.name).toBe("United Arab Emirates");
    });

    it("should throw when not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await expect(shippingService.getCountryById(fakeId)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("getCountryByCode", () => {
    it("should return active country by code", async () => {
      const result = await shippingService.getCountryByCode("AE");
      expect(result.name).toBe("United Arab Emirates");
    });

    it("should be case-insensitive", async () => {
      const result = await shippingService.getCountryByCode("ae");
      expect(result.code).toBe("AE");
    });

    it("should throw for inactive country", async () => {
      await ShippingCountry.create({
        name: "Inactive", code: "XX", currency: "XXX", currencySymbol: "X",
        defaultShippingRate: 0, isActive: false,
      });
      await expect(shippingService.getCountryByCode("XX")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("updateCountry", () => {
    it("should update country fields", async () => {
      const result = await shippingService.updateCountry(uaeId, { defaultShippingRate: 20 });
      expect(result.defaultShippingRate).toBe(20);
    });

    it("should throw on duplicate code", async () => {
      await ShippingCountry.create({
        name: "Oman", code: "OM", currency: "OMR", currencySymbol: "OMR", defaultShippingRate: 5,
      });
      await expect(
        shippingService.updateCountry(uaeId, { code: "OM" })
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("toggleCountryActive", () => {
    it("should toggle isActive", async () => {
      const result = await shippingService.toggleCountryActive(uaeId);
      expect(result.isActive).toBe(false);
      const result2 = await shippingService.toggleCountryActive(uaeId);
      expect(result2.isActive).toBe(true);
    });
  });

  describe("deleteCountry", () => {
    it("should delete country", async () => {
      await shippingService.deleteCountry(uaeId);
      const all = await ShippingCountry.find();
      expect(all).toHaveLength(0);
    });
  });

  // ============================
  // City CRUD
  // ============================

  describe("addCity", () => {
    it("should add a city", async () => {
      const result = await shippingService.addCity(uaeId, { name: "Sharjah", shippingRate: 10 });
      expect(result.cities).toHaveLength(3);
      expect(result.cities[2].name).toBe("Sharjah");
    });

    it("should throw on duplicate city", async () => {
      await expect(
        shippingService.addCity(uaeId, { name: "Dubai" })
      ).rejects.toMatchObject({ status: 400 });
    });

    it("should throw on missing name", async () => {
      await expect(
        shippingService.addCity(uaeId, {})
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("updateCity", () => {
    it("should update city name and rate", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      const result = await shippingService.updateCity(uaeId, dubaiId, { shippingRate: 5 });
      expect(result.cities[0].shippingRate).toBe(5);
    });
  });

  describe("removeCity", () => {
    it("should remove a city", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const abuDhabiId = country.cities[1]._id.toString();
      const result = await shippingService.removeCity(uaeId, abuDhabiId);
      expect(result.cities).toHaveLength(1);
    });
  });

  // ============================
  // Bulk Import
  // ============================

  describe("bulkImportCities", () => {
    it("should bulk add cities from objects array", async () => {
      const result = await shippingService.bulkImportCities(uaeId, [
        { name: "Sharjah", shippingRate: 10 },
        { name: "Ajman", shippingRate: 12 },
        { name: "Fujairah" },
      ]);
      expect(result.added).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.totalCities).toBe(5); // 2 existing + 3 new
    });

    it("should bulk add cities from string array", async () => {
      const result = await shippingService.bulkImportCities(uaeId, [
        "Sharjah", "Ajman", "Ras Al Khaimah"
      ]);
      expect(result.added).toBe(3);
    });

    it("should skip duplicate cities", async () => {
      const result = await shippingService.bulkImportCities(uaeId, [
        "Dubai", "Sharjah", "Abu Dhabi", "Ajman"
      ]);
      expect(result.added).toBe(2); // Sharjah + Ajman
      expect(result.skipped).toBe(2); // Dubai + Abu Dhabi already exist
    });

    it("should handle cities with nested areas", async () => {
      const result = await shippingService.bulkImportCities(uaeId, [
        {
          name: "Sharjah",
          shippingRate: 10,
          areas: [
            { name: "Al Nahda", shippingRate: 10 },
            { name: "Al Majaz", shippingRate: 8 },
          ],
        },
      ]);
      expect(result.added).toBe(1);
      const country = await ShippingCountry.findById(uaeId);
      const sharjah = country.cities.find(c => c.name === "Sharjah");
      expect(sharjah.areas).toHaveLength(2);
    });

    it("should throw on empty array", async () => {
      await expect(
        shippingService.bulkImportCities(uaeId, [])
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("bulkImportAreas", () => {
    it("should bulk add areas from string array", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      const result = await shippingService.bulkImportAreas(uaeId, dubaiId, [
        "JBR", "Marina", "Downtown"
      ]);
      expect(result.added).toBe(3);
      expect(result.totalAreas).toBe(5); // 2 existing + 3 new
    });

    it("should skip duplicate areas", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      const result = await shippingService.bulkImportAreas(uaeId, dubaiId, [
        "Al Barsha", "JBR", "International City"
      ]);
      expect(result.added).toBe(1); // JBR only
      expect(result.skipped).toBe(2); // Al Barsha + International City exist
    });

    it("should bulk add areas from objects", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      const result = await shippingService.bulkImportAreas(uaeId, dubaiId, [
        { name: "JBR", shippingRate: 0 },
        { name: "Business Bay", shippingRate: 3 },
      ]);
      expect(result.added).toBe(2);
    });
  });

  // ============================
  // Area CRUD
  // ============================

  describe("addArea", () => {
    it("should add an area to a city", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      const result = await shippingService.addArea(uaeId, dubaiId, { name: "JBR", shippingRate: 0 });
      expect(result.cities[0].areas).toHaveLength(3);
    });

    it("should throw on duplicate area", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      await expect(
        shippingService.addArea(uaeId, dubaiId, { name: "Al Barsha" })
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("updateArea", () => {
    it("should update area rate", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      const areaId = country.cities[0].areas[0]._id.toString();
      const result = await shippingService.updateArea(uaeId, dubaiId, areaId, { shippingRate: 3 });
      expect(result.cities[0].areas[0].shippingRate).toBe(3);
    });
  });

  describe("removeArea", () => {
    it("should remove an area", async () => {
      const country = await ShippingCountry.findById(uaeId);
      const dubaiId = country.cities[0]._id.toString();
      const areaId = country.cities[0].areas[1]._id.toString();
      const result = await shippingService.removeArea(uaeId, dubaiId, areaId);
      expect(result.cities[0].areas).toHaveLength(1);
    });
  });

  // ============================
  // Shipping Cost Calculation
  // ============================

  describe("calculateShippingCost", () => {
    it("should return area-level rate (most specific)", async () => {
      const result = await shippingService.calculateShippingCost("AE", "Dubai", "International City");
      expect(result.shippingCost).toBe(5);
      expect(result.currency).toBe("AED");
    });

    it("should return city-level rate when area not found", async () => {
      const result = await shippingService.calculateShippingCost("AE", "Abu Dhabi", "Unknown Area");
      expect(result.shippingCost).toBe(10);
    });

    it("should return country default when city not found", async () => {
      const result = await shippingService.calculateShippingCost("AE", "Unknown City");
      expect(result.shippingCost).toBe(30);
    });

    it("should return country default when no city/area provided", async () => {
      const result = await shippingService.calculateShippingCost("AE");
      expect(result.shippingCost).toBe(30);
    });

    it("should return free shipping when threshold met", async () => {
      const result = await shippingService.calculateShippingCost("AE", "Dubai", "Al Barsha", 250);
      expect(result.shippingCost).toBe(0);
      expect(result.freeShipping).toBe(true);
    });

    it("should charge shipping when below threshold", async () => {
      const result = await shippingService.calculateShippingCost("AE", "Dubai", "Al Barsha", 100);
      expect(result.shippingCost).toBe(0); // Al Barsha rate is 0
      expect(result.freeShipping).toBe(false);
    });

    it("should be case-insensitive for city and area", async () => {
      const result = await shippingService.calculateShippingCost("ae", "dubai", "al barsha");
      expect(result.shippingCost).toBe(0);
      expect(result.currency).toBe("AED");
    });

    it("should throw for inactive/unknown country", async () => {
      await expect(
        shippingService.calculateShippingCost("XX")
      ).rejects.toMatchObject({ status: 400 });
    });

    it("should default to AE when no country provided", async () => {
      const result = await shippingService.calculateShippingCost(null, "Dubai");
      expect(result.shippingCost).toBe(0);
      expect(result.currency).toBe("AED");
    });
  });

  // ============================
  // Get Cities (Public)
  // ============================

  describe("getCitiesForCountry", () => {
    it("should return cities with areas for country code", async () => {
      const result = await shippingService.getCitiesForCountry("AE");
      expect(result.country).toBe("United Arab Emirates");
      expect(result.cities).toHaveLength(2);
      expect(result.cities[0].name).toBe("Dubai");
      expect(result.cities[0].areas).toHaveLength(2);
    });

    it("should throw for unknown country", async () => {
      await expect(
        shippingService.getCitiesForCountry("XX")
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
