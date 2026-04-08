const shippingService = require("../../services/shippingService");

// ============================================
// ADMIN — Country CRUD
// ============================================

exports.list = async (req, res) => {
  try {
    const countries = await shippingService.listCountries();
    res.status(200).json({ success: true, countries });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to fetch shipping countries", error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const country = await shippingService.createCountry(req.body);
    res.status(201).json({ success: true, message: "Shipping country created.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to create shipping country", error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const country = await shippingService.getCountryById(req.params.id);
    res.status(200).json({ success: true, country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to fetch shipping country", error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const country = await shippingService.updateCountry(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Shipping country updated.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to update shipping country", error: err.message });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const country = await shippingService.toggleCountryActive(req.params.id);
    res.status(200).json({
      success: true,
      message: country.isActive ? "Country activated." : "Country deactivated.",
      country,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to toggle country", error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await shippingService.deleteCountry(req.params.id);
    res.status(200).json({ success: true, message: "Shipping country deleted." });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to delete shipping country", error: err.message });
  }
};

// ============================================
// ADMIN — Bulk Import
// ============================================

exports.bulkImportCities = async (req, res) => {
  try {
    const result = await shippingService.bulkImportCities(req.params.id, req.body.cities);
    res.status(200).json({ success: true, message: `${result.added} cities added, ${result.skipped} skipped.`, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to import cities", error: err.message });
  }
};

exports.bulkImportAreas = async (req, res) => {
  try {
    const result = await shippingService.bulkImportAreas(req.params.id, req.params.cityId, req.body.areas);
    res.status(200).json({ success: true, message: `${result.added} areas added, ${result.skipped} skipped.`, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to import areas", error: err.message });
  }
};

// ============================================
// ADMIN — City CRUD
// ============================================

exports.addCity = async (req, res) => {
  try {
    const country = await shippingService.addCity(req.params.id, req.body);
    res.status(201).json({ success: true, message: "City added.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to add city", error: err.message });
  }
};

exports.updateCity = async (req, res) => {
  try {
    const country = await shippingService.updateCity(req.params.id, req.params.cityId, req.body);
    res.status(200).json({ success: true, message: "City updated.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to update city", error: err.message });
  }
};

exports.removeCity = async (req, res) => {
  try {
    const country = await shippingService.removeCity(req.params.id, req.params.cityId);
    res.status(200).json({ success: true, message: "City removed.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to remove city", error: err.message });
  }
};

// ============================================
// ADMIN — Area CRUD
// ============================================

exports.addArea = async (req, res) => {
  try {
    const country = await shippingService.addArea(req.params.id, req.params.cityId, req.body);
    res.status(201).json({ success: true, message: "Area added.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to add area", error: err.message });
  }
};

exports.updateArea = async (req, res) => {
  try {
    const country = await shippingService.updateArea(req.params.id, req.params.cityId, req.params.areaId, req.body);
    res.status(200).json({ success: true, message: "Area updated.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to update area", error: err.message });
  }
};

exports.removeArea = async (req, res) => {
  try {
    const country = await shippingService.removeArea(req.params.id, req.params.cityId, req.params.areaId);
    res.status(200).json({ success: true, message: "Area removed.", country });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to remove area", error: err.message });
  }
};

// ============================================
// PUBLIC — Country list, cities, shipping cost
// ============================================

exports.listActive = async (req, res) => {
  try {
    const countries = await shippingService.listActiveCountries();
    res.status(200).json({ success: true, countries });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch countries", error: err.message });
  }
};

exports.getCities = async (req, res) => {
  try {
    const data = await shippingService.getCitiesForCountry(req.params.code);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to fetch cities", error: err.message });
  }
};

exports.getShippingCost = async (req, res) => {
  try {
    const { country, city, area, subtotal } = req.query;
    const result = await shippingService.calculateShippingCost(
      country,
      city,
      area,
      subtotal ? Number(subtotal) : null
    );
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: "Failed to calculate shipping cost", error: err.message });
  }
};
