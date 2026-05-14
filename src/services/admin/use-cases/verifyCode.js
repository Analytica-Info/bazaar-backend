'use strict';

const jwt        = require('jsonwebtoken');
const JWT_SECRET = require('../../../config/jwtSecret');
const Admin      = require('../../../repositories').admins.rawModel();
const clock      = require('../../../utilities/clock');

module.exports = async function verifyCode(email, code) {
    const admin = await Admin.findOne({ email });
    if (!admin) throw { status: 404, message: 'Admin not found' };

    if (!admin.resetPasswordToken || admin.resetPasswordExpires < clock.nowMs()) {
        throw { status: 400, message: 'Code expired or invalid' };
    }

    const decoded = jwt.verify(admin.resetPasswordToken, JWT_SECRET);
    if (decoded.code !== code) {
        throw { status: 400, message: 'Invalid code' };
    }

    return {};
};
