const ShippingCountry = require("../models/ShippingCountry");

// ============================================
// COUNTRY CRUD
// ============================================

exports.listCountries = async () => {
  return ShippingCountry.find().sort({ sortOrder: 1, name: 1 }).lean();
};

exports.listActiveCountries = async () => {
  return ShippingCountry.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .select("name code currency currencySymbol cities.name cities._id freeShippingThreshold")
    .lean();
};

exports.createCountry = async (data) => {
  const { name, code, currency, currencySymbol, defaultShippingRate, freeShippingThreshold, cities, sortOrder } = data;

  if (!name || !code || !currency) {
    throw { status: 400, message: "Name, code, and currency are required." };
  }

  const existing = await ShippingCountry.findOne({ code: code.toUpperCase() });
  if (existing) {
    throw { status: 400, message: `Country with code '${code.toUpperCase()}' already exists.` };
  }

  const country = await ShippingCountry.create({
    name: name.trim(),
    code: code.trim().toUpperCase(),
    currency: currency.trim().toUpperCase(),
    currencySymbol: (currencySymbol || currency).trim(),
    defaultShippingRate: defaultShippingRate || 0,
    freeShippingThreshold: freeShippingThreshold || null,
    cities: cities || [],
    sortOrder: sortOrder || 0,
  });

  return country.toObject();
};

exports.getCountryById = async (id) => {
  const country = await ShippingCountry.findById(id).lean();
  if (!country) throw { status: 404, message: "Shipping country not found." };
  return country;
};

exports.getCountryByCode = async (code) => {
  const country = await ShippingCountry.findOne({ code: code.toUpperCase(), isActive: true }).lean();
  if (!country) throw { status: 404, message: `No active shipping country found for code '${code}'.` };
  return country;
};

exports.updateCountry = async (id, data) => {
  const country = await ShippingCountry.findById(id);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  const { name, code, currency, currencySymbol, defaultShippingRate, freeShippingThreshold, sortOrder, isActive } = data;

  if (code && code.toUpperCase() !== country.code) {
    const existing = await ShippingCountry.findOne({ code: code.toUpperCase(), _id: { $ne: id } });
    if (existing) throw { status: 400, message: `Country code '${code.toUpperCase()}' already in use.` };
    country.code = code.toUpperCase();
  }

  if (name !== undefined) country.name = name.trim();
  if (currency !== undefined) country.currency = currency.toUpperCase();
  if (currencySymbol !== undefined) country.currencySymbol = currencySymbol.trim();
  if (defaultShippingRate !== undefined) country.defaultShippingRate = defaultShippingRate;
  if (freeShippingThreshold !== undefined) country.freeShippingThreshold = freeShippingThreshold;
  if (sortOrder !== undefined) country.sortOrder = sortOrder;
  if (isActive !== undefined) country.isActive = isActive;

  await country.save();
  return country.toObject();
};

exports.toggleCountryActive = async (id) => {
  const country = await ShippingCountry.findById(id);
  if (!country) throw { status: 404, message: "Shipping country not found." };
  country.isActive = !country.isActive;
  await country.save();
  return country.toObject();
};

exports.deleteCountry = async (id) => {
  const country = await ShippingCountry.findByIdAndDelete(id);
  if (!country) throw { status: 404, message: "Shipping country not found." };
  return {};
};

// ============================================
// BULK IMPORT
// ============================================

/**
 * Bulk import cities (with optional areas) into a country.
 * Skips duplicates by city name. Accepts array of:
 *   { name: "Muscat", shippingRate: 3, areas: [{ name: "Ruwi", shippingRate: 3 }] }
 *
 * Also accepts a flat array of city name strings:
 *   ["Muscat", "Salalah", "Sohar"]
 */
exports.bulkImportCities = async (countryId, cities) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  if (!Array.isArray(cities) || cities.length === 0) {
    throw { status: 400, message: "Cities array is required and must not be empty." };
  }

  const existingNames = new Set(country.cities.map((c) => c.name.toLowerCase()));
  let added = 0;
  let skipped = 0;

  for (const item of cities) {
    const cityName = typeof item === "string" ? item : item?.name;
    if (!cityName || !cityName.trim()) {
      skipped++;
      continue;
    }

    if (existingNames.has(cityName.trim().toLowerCase())) {
      skipped++;
      continue;
    }

    const cityObj = {
      name: cityName.trim(),
      shippingRate: typeof item === "object" ? (item.shippingRate ?? null) : null,
      areas: [],
    };

    // If areas provided as array
    if (typeof item === "object" && Array.isArray(item.areas)) {
      const seenAreas = new Set();
      for (const area of item.areas) {
        const areaName = typeof area === "string" ? area : area?.name;
        if (!areaName || seenAreas.has(areaName.trim().toLowerCase())) continue;
        seenAreas.add(areaName.trim().toLowerCase());
        cityObj.areas.push({
          name: areaName.trim(),
          shippingRate: typeof area === "object" ? (area.shippingRate ?? null) : null,
        });
      }
    }

    country.cities.push(cityObj);
    existingNames.add(cityName.trim().toLowerCase());
    added++;
  }

  await country.save();
  return { added, skipped, totalCities: country.cities.length, country: country.toObject() };
};

/**
 * Bulk import areas into a city. Skips duplicates.
 * Accepts array of objects or strings:
 *   [{ name: "Ruwi", shippingRate: 3 }, "Mutrah", "Qurum"]
 */
exports.bulkImportAreas = async (countryId, cityId, areas) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: "City not found." };

  if (!Array.isArray(areas) || areas.length === 0) {
    throw { status: 400, message: "Areas array is required and must not be empty." };
  }

  const existingNames = new Set(city.areas.map((a) => a.name.toLowerCase()));
  let added = 0;
  let skipped = 0;

  for (const item of areas) {
    const areaName = typeof item === "string" ? item : item?.name;
    if (!areaName || !areaName.trim()) {
      skipped++;
      continue;
    }

    if (existingNames.has(areaName.trim().toLowerCase())) {
      skipped++;
      continue;
    }

    city.areas.push({
      name: areaName.trim(),
      shippingRate: typeof item === "object" ? (item.shippingRate ?? null) : null,
    });

    existingNames.add(areaName.trim().toLowerCase());
    added++;
  }

  await country.save();
  return { added, skipped, totalAreas: city.areas.length, country: country.toObject() };
};

// ============================================
// CITY CRUD
// ============================================

exports.addCity = async (countryId, cityData) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  if (!cityData.name) throw { status: 400, message: "City name is required." };

  const duplicate = country.cities.find(
    (c) => c.name.toLowerCase() === cityData.name.trim().toLowerCase()
  );
  if (duplicate) throw { status: 400, message: `City '${cityData.name}' already exists in this country.` };

  country.cities.push({
    name: cityData.name.trim(),
    shippingRate: cityData.shippingRate != null ? cityData.shippingRate : null,
    areas: cityData.areas || [],
  });

  await country.save();
  return country.toObject();
};

exports.updateCity = async (countryId, cityId, cityData) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: "City not found." };

  if (cityData.name !== undefined) {
    const duplicate = country.cities.find(
      (c) => c._id.toString() !== cityId && c.name.toLowerCase() === cityData.name.trim().toLowerCase()
    );
    if (duplicate) throw { status: 400, message: `City '${cityData.name}' already exists.` };
    city.name = cityData.name.trim();
  }
  if (cityData.shippingRate !== undefined) city.shippingRate = cityData.shippingRate;

  await country.save();
  return country.toObject();
};

exports.removeCity = async (countryId, cityId) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: "City not found." };

  city.deleteOne();
  await country.save();
  return country.toObject();
};

// ============================================
// AREA CRUD
// ============================================

exports.addArea = async (countryId, cityId, areaData) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: "City not found." };

  if (!areaData.name) throw { status: 400, message: "Area name is required." };

  const duplicate = city.areas.find(
    (a) => a.name.toLowerCase() === areaData.name.trim().toLowerCase()
  );
  if (duplicate) throw { status: 400, message: `Area '${areaData.name}' already exists in this city.` };

  city.areas.push({
    name: areaData.name.trim(),
    shippingRate: areaData.shippingRate != null ? areaData.shippingRate : null,
  });

  await country.save();
  return country.toObject();
};

exports.updateArea = async (countryId, cityId, areaId, areaData) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: "City not found." };

  const area = city.areas.id(areaId);
  if (!area) throw { status: 404, message: "Area not found." };

  if (areaData.name !== undefined) {
    const duplicate = city.areas.find(
      (a) => a._id.toString() !== areaId && a.name.toLowerCase() === areaData.name.trim().toLowerCase()
    );
    if (duplicate) throw { status: 400, message: `Area '${areaData.name}' already exists.` };
    area.name = areaData.name.trim();
  }
  if (areaData.shippingRate !== undefined) area.shippingRate = areaData.shippingRate;

  await country.save();
  return country.toObject();
};

exports.removeArea = async (countryId, cityId, areaId) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: "Shipping country not found." };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: "City not found." };

  const area = city.areas.id(areaId);
  if (!area) throw { status: 404, message: "Area not found." };

  area.deleteOne();
  await country.save();
  return country.toObject();
};

// ============================================
// SHIPPING COST CALCULATION
// ============================================

exports.calculateShippingCost = async (countryCode, cityName, areaName, cartSubtotal) => {
  const code = (countryCode || "AE").toUpperCase();

  const country = await ShippingCountry.findOne({ code, isActive: true }).lean();
  if (!country) {
    throw { status: 400, message: `Shipping is not available to country '${code}'.` };
  }

  // Check free shipping threshold
  if (country.freeShippingThreshold && cartSubtotal && cartSubtotal >= country.freeShippingThreshold) {
    return {
      shippingCost: 0,
      currency: country.currency,
      currencySymbol: country.currencySymbol,
      countryName: country.name,
      freeShipping: true,
      freeShippingThreshold: country.freeShippingThreshold,
    };
  }

  let rate = country.defaultShippingRate;
  let matchedCity = null;
  let matchedArea = null;

  // Find matching city (case-insensitive)
  if (cityName) {
    matchedCity = country.cities.find(
      (c) => c.name.toLowerCase() === cityName.trim().toLowerCase()
    );
    if (matchedCity && matchedCity.shippingRate != null) {
      rate = matchedCity.shippingRate;
    }
  }

  // Find matching area (case-insensitive)
  if (areaName && matchedCity) {
    matchedArea = matchedCity.areas.find(
      (a) => a.name.toLowerCase() === areaName.trim().toLowerCase()
    );
    if (matchedArea && matchedArea.shippingRate != null) {
      rate = matchedArea.shippingRate;
    }
  }

  return {
    shippingCost: rate,
    currency: country.currency,
    currencySymbol: country.currencySymbol,
    countryName: country.name,
    freeShipping: false,
    freeShippingThreshold: country.freeShippingThreshold,
  };
};

// ============================================
// GET CITIES/AREAS FOR A COUNTRY (public)
// ============================================

exports.getCitiesForCountry = async (code) => {
  const country = await ShippingCountry.findOne({ code: code.toUpperCase(), isActive: true })
    .select("name code cities.name cities._id cities.areas.name cities.areas._id")
    .lean();

  if (!country) throw { status: 404, message: `Country '${code}' not found or not active.` };

  return {
    country: country.name,
    code: country.code,
    cities: country.cities.map((c) => ({
      _id: c._id,
      name: c.name,
      areas: c.areas.map((a) => ({ _id: a._id, name: a.name })),
    })),
  };
};
