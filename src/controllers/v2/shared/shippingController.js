'use strict';

const { asyncHandler } = require('../../../middleware');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const shippingService = require('../../../services/shippingService');

/**
 * GET /v2/shipping/countries
 * Returns all active shipping countries.
 */
exports.getCountries = asyncHandler(async (req, res) => {
  const countries = await shippingService.listActiveCountries();
  return res.status(200).json(wrap({ countries }));
});

/**
 * GET /v2/shipping/countries/:code/cities
 * Returns cities (and areas) for a given country code.
 */
exports.getCountryCities = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const data = await shippingService.getCitiesForCountry(code);
  // v1 spreads data directly; we normalise: data contains { cities, country } or similar
  return res.status(200).json(wrap({ cities: data.cities || data, country: data.country }));
});

/**
 * GET /v2/shipping/quote?country=AE&city=Dubai&area=JBR&subtotal=200
 * Calculates the shipping cost for the given address + cart.
 */
exports.getQuote = asyncHandler(async (req, res) => {
  const { country, city, area, subtotal } = req.query;
  const result = await shippingService.calculateShippingCost(
    country,
    city,
    area,
    subtotal ? Number(subtotal) : null
  );
  return res.status(200).json(
    wrap({
      cost: result.shippingCost,
      currency: result.currency,
      currencySymbol: result.currencySymbol,
      countryName: result.countryName,
      freeShipping: result.freeShipping,
      freeShippingThreshold: result.freeShippingThreshold,
    })
  );
});

// Alias for backward-compat within tests referencing getCost.
exports.getCost = exports.getQuote;
