'use strict';

const FooterInfoCms = require('../../../repositories').footerInfoCms.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update footer with social links
 * @param {Object} data - { tagLine, address, email, phone, facebook, tiktok, instagram, youtube }
 * @param {Object} files - { logo }
 */
async function updateFooter(data, files) {
    try {
        const { tagLine, address, email, phone, facebook, tiktok, instagram, youtube } = data;
        const logo = files?.logo || null;

        let footerInfoCms = await FooterInfoCms.findOne();
        if (!footerInfoCms) footerInfoCms = new FooterInfoCms();

        footerInfoCms.tagLine = tagLine;
        footerInfoCms.address = address;
        footerInfoCms.email = email;
        footerInfoCms.phone = phone;
        footerInfoCms.facebook = facebook;
        footerInfoCms.tiktok = tiktok;
        footerInfoCms.instagram = instagram;
        footerInfoCms.youtube = youtube;

        if (logo) {
            deleteOldFile(footerInfoCms.logo);
            footerInfoCms.logo = `${BACKEND_URL}/uploads/cms/FooterInfo/${logo.filename}?v=${clock.nowMs()}`;
        }

        await footerInfoCms.save();
        await invalidateCmsCache();
        return { message: "Data uploaded successfully" };
    } catch (error) {
        console.error(error);
        throw { status: 500, message: "Error uploading data" };
    }
}

module.exports = { updateFooter };
