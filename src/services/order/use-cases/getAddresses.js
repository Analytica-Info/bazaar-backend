'use strict';

const User = require('../../../repositories').users.rawModel();

module.exports = async function getAddresses(userId) {
    const user = await User.findById(userId).select('address');

    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    const hasAddress = user.address && user.address.length > 0;

    return {
        flag: hasAddress,
        address: user.address
    };
};
