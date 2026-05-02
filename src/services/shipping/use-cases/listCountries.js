'use strict';

const ShippingCountry = require('../../../repositories').shippingCountries.rawModel();

exports.listCountries = async () => {
  return ShippingCountry.find().sort({ sortOrder: 1, name: 1 }).lean();
};

exports.listActiveCountries = async () => {
  return ShippingCountry.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .select('name code currency currencySymbol cities.name cities._id freeShippingThreshold')
    .lean();
};

exports.getCountryById = async (id) => {
  const country = await ShippingCountry.findById(id).lean();
  if (!country) throw { status: 404, message: 'Shipping country not found.' };
  return country;
};

exports.getCountryByCode = async (code) => {
  const country = await ShippingCountry.findOne({ code: code.toUpperCase(), isActive: true }).lean();
  if (!country) throw { status: 404, message: `No active shipping country found for code '${code}'.` };
  return country;
};

exports.getCitiesForCountry = async (code) => {
  const country = await ShippingCountry.findOne({ code: code.toUpperCase(), isActive: true })
    .select('name code cities.name cities._id cities.areas.name cities.areas._id')
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
