'use strict';

// ---------------------------------------------------------------------------
// Thin facade — all logic lives in src/services/shipping/use-cases/
// ---------------------------------------------------------------------------

const { listCountries, listActiveCountries, getCountryById, getCountryByCode, getCitiesForCountry } = require('./shipping/use-cases/listCountries');
const { createCountry, updateCountry, toggleCountryActive, deleteCountry } = require('./shipping/use-cases/manageCountry');
const { addCity, updateCity, removeCity, bulkImportCities } = require('./shipping/use-cases/manageCities');
const { addArea, updateArea, removeArea, bulkImportAreas } = require('./shipping/use-cases/manageAreas');
const { calculateShippingCost } = require('./shipping/use-cases/calculateShippingCost');

module.exports = {
  listCountries,
  listActiveCountries,
  getCountryById,
  getCountryByCode,
  getCitiesForCountry,
  createCountry,
  updateCountry,
  toggleCountryActive,
  deleteCountry,
  addCity,
  updateCity,
  removeCity,
  bulkImportCities,
  addArea,
  updateArea,
  removeArea,
  bulkImportAreas,
  calculateShippingCost,
};
