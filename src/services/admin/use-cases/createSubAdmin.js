'use strict';

const bcrypt   = require('bcryptjs');
const mongoose = require('mongoose');
const Admin    = require('../../../repositories').admins.rawModel();
const Role     = require('../../../repositories').roles.rawModel();

module.exports = async function createSubAdmin(data) {
    const { firstName, lastName, email, phone, password, roleId } = data;

    if (!firstName) throw { status: 400, message: 'First Name is required' };
    if (!lastName)  throw { status: 400, message: 'Last Name is required' };
    if (!email)     throw { status: 400, message: 'Email is required' };
    if (!phone)     throw { status: 400, message: 'Phone is required' };
    if (!password)  throw { status: 400, message: 'Password is required' };
    if (!roleId)    throw { status: 400, message: 'Role is required' };

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
        throw { status: 400, message: 'Invalid role ID' };
    }

    const role = await Role.findById(roleId);
    if (!role || !role.isActive) {
        throw { status: 400, message: 'Invalid or inactive role' };
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
        throw { status: 400, message: 'Admin with this email already exists' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ firstName, lastName, email, phone, password: hashedPassword, role: roleId });
    await admin.save();

    // Must read from primary — populate immediately after save must see the write.
    const populatedAdmin = await Admin.findById(admin._id)
        .populate('role', 'name description')
        .select('-password -resetPasswordToken -resetPasswordExpires')
        .read('primary');

    return populatedAdmin;
};
