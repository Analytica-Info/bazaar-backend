'use strict';

const clock = require('../../../utilities/clock');
const { verifyAccessToken } = require('../domain/tokenIssuer');
const { User } = require('./_shared');

async function verifyCode(email, code) {
    const user = await User.findOne({ email });

    if (!user) throw { status: 404, message: 'User not found' };

    if (!user.resetPasswordToken || user.resetPasswordExpires < clock.nowMs()) {
        throw { status: 400, message: 'Code expired or invalid' };
    }

    const decoded = verifyAccessToken(user.resetPasswordToken);
    if (decoded.code !== code) {
        throw { status: 400, message: 'Invalid code' };
    }

    return {};
}

module.exports = verifyCode;
