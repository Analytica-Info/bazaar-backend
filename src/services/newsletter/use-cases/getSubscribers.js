'use strict';

const NewsLetter = require('../../../repositories').newsletters.rawModel();
const logger = require('../../../utilities/logger');

async function getSubscribers() {
  try {
    const newsLetters = await NewsLetter.find();
    return newsLetters;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching subscribers');
    throw { status: 500, message: error.message };
  }
}

module.exports = { getSubscribers };
