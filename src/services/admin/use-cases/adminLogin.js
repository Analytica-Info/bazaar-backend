'use strict';

const bcrypt        = require('bcryptjs');
const jwt           = require('jsonwebtoken');
const JWT_SECRET    = require('../../../config/jwtSecret');
const runtimeConfig = require('../../../config/runtime');
const Admin         = require('../../../repositories').admins.rawModel();

module.exports = async function adminLogin(email, password) {
    if (!email)    throw { status: 400, message: 'Email is required' };
    if (!password) throw { status: 400, message: 'Password is required' };

    const admin = await Admin.findOne({ email });
    if (!admin) throw { status: 400, message: 'Invalid Email' };

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) throw { status: 400, message: 'Invalid credentials' };

    const adminWithRole = await Admin.findById(admin._id)
        .populate({
            path: 'role',
            populate: { path: 'permissions', model: 'Permission', select: 'name slug module action' }
        })
        .select('-password -resetPasswordToken -resetPasswordExpires');

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: runtimeConfig.auth.adminTokenExpiry });
    return {
        admin: {
            name: `${admin.firstName} ${admin.lastName}`,
            email: admin.email,
            role: adminWithRole.role,
        },
        token
    };
};
