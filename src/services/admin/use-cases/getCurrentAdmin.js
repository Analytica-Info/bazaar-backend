'use strict';

const Admin = require('../../../repositories').admins.rawModel();

module.exports = async function getCurrentAdmin(adminId) {
    const admin = await Admin.findById(adminId)
        .populate({
            path: 'role',
            populate: { path: 'permissions', model: 'Permission', select: 'name slug module action' }
        })
        .select('-password -resetPasswordToken -resetPasswordExpires')
        .exec();

    if (!admin) throw { status: 404, message: 'Admin not found.' };
    return admin;
};
