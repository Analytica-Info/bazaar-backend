'use strict';

const ShippingCountry = require('../../../repositories').shippingCountries.rawModel();

exports.calculateShippingCost = async (countryCode, cityName, areaName, cartSubtotal) => {
  const code = (countryCode || 'AE').toUpperCase();

  const country = await ShippingCountry.findOne({ code, isActive: true }).lean();
  if (!country) {
    throw { status: 400, message: `Shipping is not available to country '${code}'.` };
  }

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

  if (cityName) {
    matchedCity = country.cities.find(
      (c) => c.name.toLowerCase() === cityName.trim().toLowerCase()
    );
    if (matchedCity && matchedCity.shippingRate != null) {
      rate = matchedCity.shippingRate;
    }
  }

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
