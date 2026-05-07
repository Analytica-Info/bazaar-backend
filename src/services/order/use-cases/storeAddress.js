'use strict';

const User = require('../../../repositories').users.rawModel();

module.exports = async function storeAddress(userId, addressData) {
    const { _id, name, email, city, area, floorNo, apartmentNo, landmark, buildingName, mobile, state, country, countryCode } = addressData;
    const resolvedCountry = country || countryCode || 'AE';

    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    if (_id) {
        const addressIndex = user.address.findIndex(addr => addr._id.toString() === _id);
        if (addressIndex === -1) {
            throw { status: 404, message: "Address not found" };
        }

        user.address[addressIndex] = {
            ...user.address[addressIndex].toObject(),
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
        };
    } else {
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
            isPrimary: user.address.length === 0
        });
    }
    user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));

    await user.save();

    return {
        message: _id ? "Address updated successfully" : "Address added successfully",
        addresses: user.address
    };
};
