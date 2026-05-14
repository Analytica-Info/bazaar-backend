'use strict';

const mongoose = require('mongoose');
const Admin    = require('../../../repositories').admins.rawModel();
const clock    = require('../../../utilities/clock');

module.exports = async function deleteSubAdmin(adminId) {
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
        throw { status: 400, message: 'Invalid admin ID format.' };
    }

    const admin = await Admin.findById(adminId);
    if (!admin) throw { status: 404, message: 'Admin not found.' };

    admin.isActive  = false;
    admin.updatedAt = clock.nowMs();
    await admin.save();

    return {};
};
