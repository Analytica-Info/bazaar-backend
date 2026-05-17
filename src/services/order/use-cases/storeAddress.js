'use strict';

const User = require('../../../repositories').users.rawModel();

/**
 * Create a new address on the user's profile.
 *
 * Create-only — does NOT support the legacy "if body._id is present, update
 * the matching address" overload. Updates are served by the dedicated
 * `updateAddress` use case (PATCH /me/addresses/:id). If a caller sends an
 * `_id` to this function it is silently ignored (won't be applied to the
 * pushed subdoc), so callers must use PATCH for updates.
 *
 * The first address pushed to an empty list is auto-marked primary; further
 * addresses default to non-primary. Use `updateAddress` with body
 * `{ primary: true }` to flip the primary.
 */
module.exports = async function storeAddress(userId, addressData) {
    const { name, email, city, area, floorNo, apartmentNo, landmark, buildingName, mobile, state, country, countryCode } = addressData;
    const resolvedCountry = country || countryCode || 'AE';

    const user = await User.findById(userId);
    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    user.address.push({
        name,
        city,
        email,
        area,
        floorNo,
        apartmentNo,
        landmark,
        buildingName,
        mobile,
        state,
        country: resolvedCountry,
        isPrimary: user.address.length === 0,
    });
    user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));

    await user.save();

    return {
        message: "Address added successfully",
        addresses: user.address,
    };
};
