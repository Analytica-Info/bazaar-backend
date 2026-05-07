'use strict';

const mongoose = require('mongoose');
const Admin    = require('../../../repositories').admins.rawModel();
const Role     = require('../../../repositories').roles.rawModel();
const clock    = require('../../../utilities/clock');

module.exports = async function updateSubAdmin(adminId, data) {
    const { firstName, lastName, email, phone, roleId, isActive } = data;

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
        throw { status: 400, message: 'Invalid admin ID format.' };
    }

    const admin = await Admin.findById(adminId);
    if (!admin) throw { status: 404, message: 'Admin not found.' };

    if (roleId) {
        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            throw { status: 400, message: 'Invalid role ID' };
        }
        const role = await Role.findById(roleId);
        if (!role || !role.isActive) {
            throw { status: 400, message: 'Invalid or inactive role' };
        }
        admin.role = roleId;
    }

    if (email && email !== admin.email) {
        const existingAdmin = await Admin.findOne({ email, _id: { $ne: adminId } });
        if (existingAdmin) {
            throw { status: 400, message: 'Email already exists for another admin.' };
        }
        admin.email = email;
    }

    if (firstName  !== undefined) admin.firstName = firstName;
    if (lastName   !== undefined) admin.lastName  = lastName;
    if (phone      !== undefined) admin.phone     = phone;
    if (isActive   !== undefined) admin.isActive  = isActive;

    admin.updatedAt = clock.nowMs();
    await admin.save();

    // Must read from primary — populate immediately after save must see the write.
    const populatedAdmin = await Admin.findById(admin._id)
        .populate('role', 'name description')
        .select('-password -resetPasswordToken -resetPasswordExpires')
        .read('primary');

    return populatedAdmin;
};
