/**
 * Seed shipping countries: UAE + Oman
 *
 * Usage:
 *   node src/scripts/seedShippingCountries.js
 *
 * Idempotent — skips countries that already exist by code.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const ShippingCountry = require("../models/ShippingCountry");

const countries = [
  {
    name: "United Arab Emirates",
    code: "AE",
    currency: "AED",
    currencySymbol: "AED",
    defaultShippingRate: 30,
    freeShippingThreshold: 200,
    sortOrder: 1,
    isActive: true,
    cities: [
      {
        name: "Dubai",
        shippingRate: 0,
        areas: [
          { name: "Al Barsha", shippingRate: 0 },
          { name: "Deira", shippingRate: 0 },
          { name: "Downtown", shippingRate: 0 },
          { name: "Marina", shippingRate: 0 },
          { name: "JBR", shippingRate: 0 },
          { name: "Business Bay", shippingRate: 0 },
          { name: "Jumeirah", shippingRate: 0 },
          { name: "Al Quoz", shippingRate: 0 },
          { name: "International City", shippingRate: 5 },
          { name: "Dubai Silicon Oasis", shippingRate: 5 },
        ],
      },
      {
        name: "Abu Dhabi",
        shippingRate: 10,
        areas: [
          { name: "Al Reem Island", shippingRate: 10 },
          { name: "Yas Island", shippingRate: 10 },
          { name: "Khalifa City", shippingRate: 10 },
          { name: "Saadiyat Island", shippingRate: 10 },
          { name: "Al Ain", shippingRate: 15 },
        ],
      },
      {
        name: "Sharjah",
        shippingRate: 10,
        areas: [
          { name: "Al Nahda", shippingRate: 10 },
          { name: "Al Majaz", shippingRate: 10 },
          { name: "Al Khan", shippingRate: 10 },
        ],
      },
      {
        name: "Ajman",
        shippingRate: 10,
        areas: [
          { name: "Al Nuaimiya", shippingRate: 10 },
          { name: "Al Rashidiya", shippingRate: 10 },
        ],
      },
      {
        name: "Ras Al Khaimah",
        shippingRate: 15,
        areas: [],
      },
      {
        name: "Fujairah",
        shippingRate: 15,
        areas: [],
      },
      {
        name: "Umm Al Quwain",
        shippingRate: 15,
        areas: [],
      },
    ],
  },
  {
    name: "Oman",
    code: "OM",
    currency: "OMR",
    currencySymbol: "OMR",
    defaultShippingRate: 150,
    freeShippingThreshold: null,
    sortOrder: 2,
    isActive: true,
    cities: [
      {
        name: "Muscat",
        shippingRate: 3,
        areas: [
          { name: "Al Khuwair", shippingRate: 3 },
          { name: "Ruwi", shippingRate: 3 },
          { name: "Mutrah", shippingRate: 3 },
          { name: "Qurum", shippingRate: 3 },
          { name: "Seeb", shippingRate: 3 },
        ],
      },
      {
        name: "Salalah",
        shippingRate: 5,
        areas: [],
      },
      {
        name: "Sohar",
        shippingRate: 5,
        areas: [],
      },
      {
        name: "Nizwa",
        shippingRate: 5,
        areas: [],
      },
      {
        name: "Sur",
        shippingRate: 5,
        areas: [],
      },
    ],
  },
];

async function seed() {
  await connectDB();

  for (const countryData of countries) {
    const existing = await ShippingCountry.findOne({ code: countryData.code });
    if (existing) {
      console.log(`Skipping ${countryData.name} (${countryData.code}) — already exists`);
      continue;
    }

    await ShippingCountry.create(countryData);
    console.log(`Created ${countryData.name} (${countryData.code}) with ${countryData.cities.length} cities`);
  }

  console.log("Seed complete.");
  await mongoose.connection.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
