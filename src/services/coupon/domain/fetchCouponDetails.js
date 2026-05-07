'use strict';

const axios = require('axios');
const logger = require('../../../utilities/logger');

const API_KEY = process.env.API_KEY;

/**
 * Fetch a Lightspeed promotion by ID.
 * @param {string} id - Lightspeed promotion ID
 * @returns {Promise<Object|null>}
 */
async function fetchCouponDetails(id) {
    try {
        const response = await axios.get(
            `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/promotions/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${API_KEY}`,
                    Accept: "application/json",
                },
            }
        );

        if (response?.data?.data) {
            return response.data.data;
        }

        logger.error("Invalid promotion response format.");
        return null;
    } catch (error) {
        console.error(`Error fetching coupon details for ID: ${id} ->`, error.response?.data || error.message);
        return null;
    }
}

module.exports = { fetchCouponDetails };
