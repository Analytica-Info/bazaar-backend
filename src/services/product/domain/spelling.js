'use strict';
// TODO: BUG-012 — checkSpelling is dead code (never called from any route or
// use-case). Deferred to PR-MOD-8 cleanup. Do not add new call-sites.

const NodeCache = require('node-cache');
const Typo = require('typo-js');
const logger = require('../../../utilities/logger');

// spellingCache keeps 7-day in-memory storage for fuzzy-match suggestions —
// left on NodeCache: tiny, very hot, fine to re-warm on restart.
const spellingCache = new NodeCache({ stdTTL: 604800 }); // 7 days
const dictionary = new Typo('en_US');

const checkSpelling = async (word) => {
  if (!word || typeof word !== 'string') {
    return null;
  }

  const normalizedWord = word.trim().toLowerCase();
  const cacheKey = `spelling:${normalizedWord}`;

  const cachedResult = spellingCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  try {
    let suggestion = null;

    if (!dictionary.check(normalizedWord)) {
      const suggestions = dictionary.suggest(normalizedWord);
      suggestion = suggestions.length > 0 ? suggestions[0] : null;
    }

    spellingCache.set(cacheKey, suggestion);
    return suggestion;
  } catch (error) {
    logger.error({ err: error }, 'Error in checkSpelling:');
    return null;
  }
};

module.exports = { checkSpelling };
