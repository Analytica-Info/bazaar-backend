'use strict';

const ShippingCountry = require('../../../repositories').shippingCountries.rawModel();

exports.addArea = async (countryId, cityId, areaData) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: 'City not found.' };

  if (!areaData.name) throw { status: 400, message: 'Area name is required.' };

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
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: 'City not found.' };

  const area = city.areas.id(areaId);
  if (!area) throw { status: 404, message: 'Area not found.' };

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
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: 'City not found.' };

  const area = city.areas.id(areaId);
  if (!area) throw { status: 404, message: 'Area not found.' };

  area.deleteOne();
  await country.save();
  return country.toObject();
};

exports.bulkImportAreas = async (countryId, cityId, areas) => {
  const country = await ShippingCountry.findById(countryId);
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

  const city = country.cities.id(cityId);
  if (!city) throw { status: 404, message: 'City not found.' };

  if (!Array.isArray(areas) || areas.length === 0) {
    throw { status: 400, message: 'Areas array is required and must not be empty.' };
  }

  const existingNames = new Set(city.areas.map((a) => a.name.toLowerCase()));
  let added = 0;
  let skipped = 0;

  for (const item of areas) {
    const areaName = typeof item === 'string' ? item : item?.name;
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
      shippingRate: typeof item === 'object' ? (item.shippingRate ?? null) : null,
    });

    existingNames.add(areaName.trim().toLowerCase());
    added++;
  }

  await country.save();
  return { added, skipped, totalAreas: city.areas.length, country: country.toObject() };
};
