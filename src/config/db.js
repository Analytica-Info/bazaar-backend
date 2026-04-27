const mongoose = require('mongoose');
const logger = require('../utilities/logger');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Route all reads to secondaries by default — primary only for writes.
      // Individual queries that must read their own writes can override with
      // { readPreference: 'primary' } at the query level.
      readPreference: 'secondaryPreferred',
    });
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error({ err: error.message }, 'MongoDB connection failed');
    process.exit(1);
  }
};

module.exports = connectDB;
