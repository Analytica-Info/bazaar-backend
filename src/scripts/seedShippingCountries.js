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
        shippingRate: 30,
        areas: [
          { name: "Al Barsha" },
          { name: "Deira" },
          { name: "Downtown" },
          { name: "Marina" },
          { name: "JBR" },
          { name: "Business Bay" },
          { name: "Jumeirah" },
          { name: "Al Quoz" },
          { name: "International City" },
          { name: "Dubai Silicon Oasis" },
        ],
      },
      {
        name: "Abu Dhabi",
        shippingRate: 30,
        areas: [
          { name: "Al Reem Island" },
          { name: "Yas Island" },
          { name: "Khalifa City" },
          { name: "Saadiyat Island" },
          { name: "Al Ain" },
        ],
      },
      {
        name: "Sharjah",
        shippingRate: 30,
        areas: [
          { name: "Al Nahda" },
          { name: "Al Majaz" },
          { name: "Al Khan" },
        ],
      },
      {
        name: "Ajman",
        shippingRate: 30,
        areas: [
          { name: "Al Nuaimiya" },
          { name: "Al Rashidiya" },
        ],
      },
      {
        name: "Ras Al Khaimah",
        shippingRate: 30,
        areas: [],
      },
      {
        name: "Fujairah",
        shippingRate: 30,
        areas: [],
      },
      {
        name: "Umm Al Quwain",
        shippingRate: 30,
        areas: [],
      },
    ],
  },
  {
    name: "Oman",
    code: "OM",
    currency: "AED",
    currencySymbol: "AED",
    defaultShippingRate: 150,
    freeShippingThreshold: null,
    sortOrder: 2,
    isActive: true,
    cities: [
      {
        name: "Muscat",
        shippingRate: 150,
        areas: [
          { name: "Al Khuwair" },
          { name: "Ruwi" },
          { name: "Mutrah" },
          { name: "Qurum" },
          { name: "Seeb" },
        ],
      },
      {
        name: "Salalah",
        shippingRate: 150,
        areas: [],
      },
      {
        name: "Sohar",
        shippingRate: 150,
        areas: [],
      },
      {
        name: "Nizwa",
        shippingRate: 150,
        areas: [],
      },
      {
        name: "Sur",
        shippingRate: 150,
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
