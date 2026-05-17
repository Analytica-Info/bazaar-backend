'use strict';

const User = require('../../../repositories').users.rawModel();

/**
 * Partially update an address on the user's profile.
 *
 * Body fields are an allowlist of known address attributes plus the
 * `primary` flag. Any field present in the patch is applied; absent fields
 * are left untouched. Unknown keys in the patch are silently ignored.
 *
 * Setting `primary: true` clears the primary flag on all sibling addresses
 * and applies it to the target. Setting `primary: false` only clears the
 * flag on the target.
 *
 * @param {string} userId
 * @param {string} addressId  - subdoc _id under user.address
 * @param {object} patch      - { name?, city?, area?, mobile?, ..., primary? }
 * @returns {Promise<{ addresses: Array, message: string }>}
 */
const PATCHABLE_FIELDS = Object.freeze([
    'name', 'email', 'mobile',
    'city', 'area', 'state', 'country', 'countryCode',
    'floorNo', 'apartmentNo', 'buildingName', 'landmark',
]);

module.exports = async function updateAddress(userId, addressId, patch = {}) {
    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: "User not found" };

    const addressIndex = user.address.findIndex((addr) => addr._id.toString() === addressId);
    if (addressIndex === -1) throw { status: 404, message: "Address not found" };

    const target = user.address[addressIndex];

    // Apply known address-field patches
    for (const field of PATCHABLE_FIELDS) {
        if (patch[field] !== undefined) {
            // countryCode is an alias for country
            if (field === 'countryCode' && patch.country === undefined) {
                target.country = patch.countryCode;
            } else if (field !== 'countryCode') {
                target[field] = patch[field];
            }
        }
    }

    // Primary flag mutation (clears siblings when set to true)
    if (patch.primary === true) {
        user.address.forEach((addr) => { addr.isPrimary = false; });
        target.isPrimary = true;
    } else if (patch.primary === false) {
        target.isPrimary = false;
    }

    user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));
    await user.save();

    return {
        addresses: user.address,
        message: "Address updated successfully",
    };
};
