'use strict';

const AboutCms = require('../../../repositories').abouts.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update about page
 * @param {Object} data - { contents (JSON string or parsed array) }
 * @param {Object} files - { backgroundImage }
 */
async function updateAbout(data, files) {
    try {
        let contents = [];
        if (data.contents) {
            try {
                contents = typeof data.contents === "string" ? JSON.parse(data.contents) : data.contents;
            } catch (err) {
                throw { status: 400, message: "Invalid contents format" };
            }
        }

        const backgroundImage = files?.backgroundImage || null;

        let aboutCms = await AboutCms.findOne();
        if (!aboutCms) aboutCms = new AboutCms();

        aboutCms.contents = contents;

        if (backgroundImage) {
            deleteOldFile(aboutCms.backgroundImage);
            aboutCms.backgroundImage = `${BACKEND_URL}/uploads/cms/About/${backgroundImage.filename}?v=${clock.nowMs()}`;
        }

        await aboutCms.save();
        await invalidateCmsCache();
        return { message: "Data uploaded successfully" };
    } catch (error) {
        if (error.status) throw error;
        console.error(error);
        throw { status: 500, message: "Error uploading data" };
    }
}

module.exports = { updateAbout };
