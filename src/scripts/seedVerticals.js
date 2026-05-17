#!/usr/bin/env node
/**
 * One-shot seed: upserts the verticals collection.
 *
 * Run once after deploy:
 *   node src/scripts/seedVerticals.js
 *
 * Idempotent — safe to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const VERTICALS = [
    {
        id: 'uae',
        label: 'UAE',
        tag: 'Default',
        enabled: true,
        comingSoon: false,
        launchDate: null,
        sortOrder: 0,
    },
    {
        id: 'auction',
        label: 'Auction',
        tag: 'Live',
        enabled: false,
        comingSoon: true,
        launchDate: new Date('2026-08-01T00:00:00Z'),
        sortOrder: 1,
    },
    {
        id: 'marketplace',
        label: 'Marketplace',
        tag: 'Coming Soon',
        enabled: false,
        comingSoon: true,
        launchDate: null,
        sortOrder: 2,
    },
    {
        id: 'wholesale',
        label: 'Wholesale',
        tag: 'Coming Soon',
        enabled: false,
        comingSoon: true,
        launchDate: null,
        sortOrder: 3,
    },
    {
        id: 'home',
        label: 'Home',
        tag: 'Coming Soon',
        enabled: false,
        comingSoon: true,
        launchDate: null,
        sortOrder: 4,
    },
];

async function main() {
    await connectDB();
    const Vertical = require('../models/Vertical');

    for (const data of VERTICALS) {
        const { id, ...rest } = data;
        await Vertical.findOneAndUpdate(
            { id },
            { $set: rest, $setOnInsert: { id } },
            { upsert: true, new: true }
        );
        console.log(`Upserted vertical: ${id}`);
    }

    console.log('\nSeed complete.');
    await mongoose.connection.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
