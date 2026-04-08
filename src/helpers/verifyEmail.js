const axios = require("axios");

const logger = require("../utilities/logger");
async function verifyEmailWithVeriEmail(email) {
    try {
        const apiKey = process.env.VERIEMAIL_API_KEY;
        const response = await axios.get(`https://api.verimail.io/v3/verify`, {
            params: { key: apiKey, email }
        });

        return response.data;
    } catch (error) {
        console.error("VeriEmail API error:", error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    verifyEmailWithVeriEmail,
};
