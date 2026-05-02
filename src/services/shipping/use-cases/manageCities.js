'use strict';

const ShippingCountry = require('../../../repositories').shippingCountries.rawModel();

exports.addCity = async (countryId, cityData) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  if (!cityData.name) throw { status: 400, message: 'City name is required.' };

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
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: 'City not found.' };

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
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: 'City not found.' };

  city.deleteOne();
  await country.save();
  return country.toObject();
};

exports.bulkImportCities = async (countryId, cities) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  if (!Array.isArray(cities) || cities.length === 0) {
    throw { status: 400, message: 'Cities array is required and must not be empty.' };
  }

  const existingNames = new Set(country.cities.map((c) => c.name.toLowerCase()));
  let added = 0;
  let skipped = 0;

  for (const item of cities) {
    const cityName = typeof item === 'string' ? item : item?.name;
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
      shippingRate: typeof item === 'object' ? (item.shippingRate ?? null) : null,
      areas: [],
    };

    if (typeof item === 'object' && Array.isArray(item.areas)) {
      const seenAreas = new Set();
      for (const area of item.areas) {
        const areaName = typeof area === 'string' ? area : area?.name;
        if (!areaName || seenAreas.has(areaName.trim().toLowerCase())) continue;
        seenAreas.add(areaName.trim().toLowerCase());
        cityObj.areas.push({
          name: areaName.trim(),
          shippingRate: typeof area === 'object' ? (area.shippingRate ?? null) : null,
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
