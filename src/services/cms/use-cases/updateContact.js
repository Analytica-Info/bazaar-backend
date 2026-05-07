'use strict';

const ContactCms = require('../../../repositories').contactsCms.rawModel();
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

/**
 * Update contact info
 * @param {Object} data - { tagLine, address, email, phone, facebook, tiktok, instagram }
 */
async function updateContact(data) {
    try {
        const { tagLine, address, email, phone, facebook, tiktok, instagram } = data;

        let contactCms = await ContactCms.findOne();
        if (!contactCms) contactCms = new ContactCms();

        contactCms.tagLine = tagLine;
        contactCms.address = address;
        contactCms.email = email;
        contactCms.phone = phone;
        contactCms.facebook = facebook;
        contactCms.tiktok = tiktok;
        contactCms.instagram = instagram;

        await contactCms.save();
        await invalidateCmsCache();
        return { message: "Data uploaded successfully" };
    } catch (error) {
        console.error(error);
        throw { status: 500, message: "Error uploading data" };
    }
}

module.exports = { updateContact };
