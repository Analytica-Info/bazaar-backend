'use strict';

const ShippingCountry = require('../../../repositories').shippingCountries.rawModel();

exports.createCountry = async (data) => {
  const { name, code, currency, currencySymbol, defaultShippingRate, freeShippingThreshold, cities, sortOrder } = data;

  if (!name || !code || !currency) {
    throw { status: 400, message: 'Name, code, and currency are required.' };
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

exports.updateCountry = async (id, data) => {
  const country = await ShippingCountry.findById(id);
  if (!country) throw { status: 404, message: 'Shipping country not found.' };

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
  if (!country) throw { status: 404, message: 'Shipping country not found.' };
  country.isActive = !country.isActive;
  await country.save();
  return country.toObject();
};

exports.deleteCountry = async (id) => {
  const country = await ShippingCountry.findByIdAndDelete(id);
  if (!country) throw { status: 404, message: 'Shipping country not found.' };
  return {};
};
