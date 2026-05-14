'use strict';

const HeaderInfoCms = require('../../../repositories').headerInfo.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update header info
 * @param {Object} data - { contactNumber }
 * @param {Object} files - { logo: fileObj }
 */
async function updateHeader(data, files) {
    try {
        const { contactNumber } = data;
        const logo = files?.logo || null;

        let headerInfo = await HeaderInfoCms.findOne();
        if (!headerInfo) headerInfo = new HeaderInfoCms();

        headerInfo.contactNumber = contactNumber;

        if (logo) {
            deleteOldFile(headerInfo.logo);
            headerInfo.logo = `${BACKEND_URL}/uploads/cms/HeaderInfo/${logo.filename}?v=${clock.nowMs()}`;
        }

        await headerInfo.save();
        await invalidateCmsCache();
        return { message: "Header info saved successfully" };
    } catch (error) {
        console.error(error);
        throw { status: 500, message: "Error saving header info" };
    }
}

module.exports = { updateHeader };
