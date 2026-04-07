// googleSheetExporter.js

const { google } = require('googleapis');
const path = require('path');
const axios = require('axios');
const Product = require('../models/Product'); // Adjust path as needed
const Brand = require("../models/Brand");

const WEB_URL = process.env.URL;

// Helper to fetch brand name by brand_id
async function getBrandName(brand_id) {
  if (!brand_id) return 'GENERIC';
  const brand = await Brand.findOne({ id: brand_id }).lean();
  return (brand?.name || 'GENERIC').toUpperCase();
}

// Map a single product document to Google Sheet row (with brand name)
async function mapProductForSheet(productDoc) {
  const product = productDoc.product || {};
  const variantsData = productDoc.variantsData || [];
  const firstImage = product.images && product.images.length > 0 ? product.images[0].sizes.original : '';
  const price = variantsData.length > 0 ? variantsData[0].price : '';
  const link = `${WEB_URL}/product-details/${product.id}`; // Change domain as needed
  const brandName = await getBrandName(product.brand_id);

  return [
    product.id || '',
    product.name || '',
    product.description || '',
    product.is_active ? 'in_stock' : 'out_of_stock',
    link,
    firstImage,
    price,
      'no',
    brandName,

  ];
}

// Fetch and map all products (with concurrent brand lookups)
async function getProductsForSheet() {
  const products = await Product.find({}).lean();
  // Only include products with at least one variant and a price
  const filtered = products.filter(doc => {
    const variantsData = doc.variantsData || [];
    return variantsData.length > 0 && variantsData[0].price;
  });
  return Promise.all(filtered.map(mapProductForSheet));
}
// Export to Google Sheet
async function exportProductsToGoogleSheet(spreadsheetId, sheetName = 'products_sheet') {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../config/bazaar-465306-12fdf96f3aab.json'), // <-- update this path
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const header = [
    'id',
    'title',
    'description',
    'availability',
    'link',
    'image link',
    'price',
    'identifier exists',
    'brand',

  ];
  const rows = await getProductsForSheet();
  rows.unshift(header);

  // Clear the sheet
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    resource: { values: rows },
  });

  return { success: true, rowCount: rows.length - 1 };
}

module.exports = { exportProductsToGoogleSheet };
