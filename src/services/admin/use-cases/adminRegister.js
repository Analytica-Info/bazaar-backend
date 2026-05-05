'use strict';

const bcrypt = require('bcryptjs');
const Admin  = require('../../../repositories').admins.rawModel();

module.exports = async function adminRegister(data) {
    const { firstName, lastName, email, phone, password } = data;

    if (!firstName) throw { status: 400, message: 'first Name is required' };
    if (!lastName)  throw { status: 400, message: 'Last Name is required' };
    if (!email)     throw { status: 400, message: 'Email is required' };
    if (!phone)     throw { status: 400, message: 'phone is required' };
    if (!password)  throw { status: 400, message: 'Password is required' };

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
        throw { status: 400, message: 'Admin already exists' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ firstName, lastName, email, phone, password: hashedPassword, role: 'admin' });
    await admin.save();
    return admin;
};
