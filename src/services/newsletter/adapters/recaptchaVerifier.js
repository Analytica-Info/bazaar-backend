'use strict';

const axios = require('axios');
const logger = require('../../../utilities/logger');

/**
 * Verify a reCAPTCHA Enterprise token.
 * Throws { status, message } on failure, resolves on success.
 * @param {string} recaptchaToken
 * @param {string} expectedAction
 */
async function verifyRecaptcha(recaptchaToken, expectedAction) {
  const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY;
  const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

  if (!RECAPTCHA_API_KEY || !PROJECT_ID) {
    logger.error('reCAPTCHA Enterprise credentials are not configured');
    throw { status: 500, message: 'Server configuration error' };
  }

  try {
    const recaptchaResponse = await axios.post(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`,
      {
        event: {
          token: recaptchaToken,
          expectedAction,
          siteKey: process.env.RECAPTCHA_SITE_KEY,
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const { tokenProperties, riskAnalysis } = recaptchaResponse.data;

    if (!tokenProperties?.valid) {
      logger.error({ invalidReason: tokenProperties?.invalidReason }, 'reCAPTCHA token is invalid');
      throw { status: 403, message: 'Security verification failed. Please try again.' };
    }

    if (tokenProperties?.action !== expectedAction) {
      logger.error({ action: tokenProperties?.action }, 'Invalid reCAPTCHA action');
      throw { status: 403, message: 'Invalid verification action' };
    }

    const score = riskAnalysis?.score || 0;
    const MINIMUM_SCORE = 0.5;

    if (score < MINIMUM_SCORE) {
      logger.warn({ score, minimum: MINIMUM_SCORE }, 'Low reCAPTCHA score detected');
      throw { status: 403, message: 'Suspicious activity detected. Please try again later.' };
    }
  } catch (err) {
    if (err.status) throw err;
    logger.error({ err: err.response?.data || err.message }, 'Error verifying reCAPTCHA');
    throw { status: 500, message: 'Failed to verify security check. Please try again.' };
  }
}

module.exports = { verifyRecaptcha };
