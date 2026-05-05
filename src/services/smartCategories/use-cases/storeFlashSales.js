'use strict';

const FlashSale = require('../../../repositories').flashSales.rawModel();
const cache = require('../../../utilities/cache');

/**
 * Store or update flash sale configuration.
 * @param {Object} config
 * @param {string} config.startDay
 * @param {string} config.startTime
 * @param {string} config.endDay
 * @param {string} config.endTime
 * @param {boolean} [config.isEnabled]
 */
async function storeFlashSales({ startDay, startTime, endDay, endTime, isEnabled }) {
    if (!startDay || !startTime || !endDay || !endTime) {
        const err = new Error("All fields required");
        err.status = 400;
        err.responseBody = { success: false, message: "All fields required" };
        throw err;
    }

    let flashSale = await FlashSale.findOne();
    if (flashSale) {
        flashSale.startDay = startDay;
        flashSale.startTime = startTime;
        flashSale.endDay = endDay;
        flashSale.endTime = endTime;
        if (isEnabled !== undefined) {
            flashSale.isEnabled = isEnabled;
        }
        await flashSale.save();
    } else {
        flashSale = await FlashSale.create({
            startDay,
            startTime,
            endDay,
            endTime,
            isEnabled: isEnabled !== undefined ? isEnabled : true
        });
    }

    await cache.delPattern('catalog:flash-sale:*');

    return { success: true, flashSale };
}

module.exports = { storeFlashSales };
