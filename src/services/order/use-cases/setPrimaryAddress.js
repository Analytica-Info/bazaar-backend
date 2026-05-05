'use strict';

const User = require('../../../repositories').users.rawModel();

module.exports = async function setPrimaryAddress(userId, addressId) {
    const user = await User.findById(userId);
    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    const addressIndex = user.address.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
        throw { status: 404, message: "Address not found" };
    }

    user.address.forEach(addr => {
        addr.isPrimary = false;
    });

    user.address[addressIndex].isPrimary = true;
    user.address.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true));

    await user.save();

    return {
        addresses: user.address
    };
};
