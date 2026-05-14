'use strict';

const axios = require('axios');
const logger = require('../../../utilities/logger');

/**
 * Validate an email address via Abstract API.
 * Returns { valid: boolean, reason: string, email: string }.
 */
async function validateEmail(email) {
  try {
    const response = await axios.get('https://emailvalidation.abstractapi.com/v1/', {
      params: {
        api_key: '965f90f6ec9d48cf8fa0601caa603276',
        email,
      },
    });

    const data = response.data;

    if (data.deliverability === 'DELIVERABLE' && !data.is_disposable_email.value) {
      return { valid: true, reason: 'Email is valid and deliverable.', email };
    } else {
      return { valid: false, reason: data.deliverability, email };
    }
  } catch (error) {
    logger.error({ err: error }, 'Error validating email');
    return { valid: false, reason: 'API request failed', email };
  }
}

module.exports = { validateEmail };
