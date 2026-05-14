'use strict';

const User = require('../../../repositories').users.rawModel();

module.exports = async function deleteAddress(userId, addressId) {
    const user = await User.findById(userId);
    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    const addressIndex = user.address.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
        throw { status: 404, message: "Address not found" };
    }

    user.address.splice(addressIndex, 1);
    await user.save();

    return {
        addresses: user.address
    };
};
