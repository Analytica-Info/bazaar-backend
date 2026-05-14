'use strict';

const bcrypt = require('bcryptjs');
const Admin  = require('../../../repositories').admins.rawModel();

module.exports = async function updatePassword(adminId, oldPassword, newPassword) {
    const admin = await Admin.findById(adminId);
    if (!admin) throw { status: 404, message: 'Admin not found' };

    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) throw { status: 400, message: 'Old password is incorrect' };

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    return {};
};
