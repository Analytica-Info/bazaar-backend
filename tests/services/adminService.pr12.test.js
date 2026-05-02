/**
 * adminService.pr12.test.js
 * PR12 — Push adminService to ≥80% lines.
 * Covers: enrichOrdersWithDetails with real data, adminRegister/Login validation,
 *         verifyCode/resetPassword, updatePassword, createSubAdmin/updateSubAdmin edge cases,
 *         getAllUsers filters, getOrders filters, updateOrderStatus, blockUser/unblockUser error paths.
 */

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';

require('../setup');

jest.mock('../../src/mail/emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/models/Coupons', () => ({
    findOne: jest.fn().mockResolvedValue(null),
}));

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const adminService = require('../../src/services/adminService');
const Admin = require('../../src/models/Admin');
const User = require('../../src/models/User');
const Role = require('../../src/models/Role');
const Order = require('../../src/models/Order');
const OrderDetail = require('../../src/models/OrderDetail');
const Product = require('../../src/models/Product');
const ActivityLog = require('../../src/models/ActivityLog');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAdmin = async (overrides = {}) => {
    const hashedPassword = await bcrypt.hash('Admin@1234', 10);
    return Admin.create({
        firstName: 'Test',
        lastName: 'Admin',
        phone: '0501234567',
        email: `admin-${Date.now()}-${Math.random()}@test.com`,
        password: hashedPassword,
        ...overrides,
    });
};

const makeRole = async (overrides = {}) => Role.create({
    name: `Role-${Date.now()}`,
    description: 'Test role',
    isActive: true,
    ...overrides,
});

const makeUser = async (overrides = {}) => User.create({
    name: 'Test User',
    email: `user-${Date.now()}-${Math.random()}@test.com`,
    phone: '0507654321',
    password: 'hashedpassword',
    ...overrides,
});

const makeOrder = async (userId, overrides = {}) => Order.create({
    userId,
    order_id: `BZR-PR12-${Date.now()}`,
    order_no: Math.floor(Math.random() * 99999),
    name: 'Test User',
    address: '123 Test St',
    email: 'user@test.com',
    status: 'Confirmed',
    amount_subtotal: '100',
    amount_total: '110',
    discount_amount: '0',
    txn_id: 'txn_pr12',
    payment_method: 'card',
    payment_status: 'paid',
    ...overrides,
});

// ---------------------------------------------------------------------------
// adminRegister — validation branches
// ---------------------------------------------------------------------------
describe('adminRegister — missing field validation', () => {
    it.each([
        [{ lastName: 'D', email: 'e@test.com', phone: '123', password: 'P' }, /first name/i],
        [{ firstName: 'J', email: 'e@test.com', phone: '123', password: 'P' }, /last name/i],
        [{ firstName: 'J', lastName: 'D', phone: '123', password: 'P' }, /email/i],
        [{ firstName: 'J', lastName: 'D', email: 'e@test.com', password: 'P' }, /phone/i],
        [{ firstName: 'J', lastName: 'D', email: 'e@test.com', phone: '123' }, /password/i],
    ])('throws 400 when field missing: %j', async (data, msgPattern) => {
        await expect(adminService.adminRegister(data))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(msgPattern) });
    });
});

// ---------------------------------------------------------------------------
// adminLogin — validation branches
// ---------------------------------------------------------------------------
describe('adminLogin — missing field validation', () => {
    it('throws 400 when email is missing', async () => {
        await expect(adminService.adminLogin(null, 'pass'))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/email/i) });
    });

    it('throws 400 when password is missing', async () => {
        await expect(adminService.adminLogin('admin@test.com', null))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/password/i) });
    });
});

// ---------------------------------------------------------------------------
// forgotPassword — success path (sets token and expires)
// ---------------------------------------------------------------------------
describe('forgotPassword — success path', () => {
    it('sets resetPasswordToken and calls sendEmail', async () => {
        const { sendEmail } = require('../../src/mail/emailService');
        const admin = await makeAdmin({ email: 'forgot-success@test.com' });

        await adminService.forgotPassword('forgot-success@test.com');

        const updated = await Admin.findById(admin._id).lean();
        expect(updated.resetPasswordToken).toBeDefined();
        // resetPasswordExpires is stored as a Date (Date object) — ensure it is in the future
        const expiresMs = updated.resetPasswordExpires instanceof Date
            ? updated.resetPasswordExpires.getTime()
            : Number(updated.resetPasswordExpires);
        expect(expiresMs).toBeGreaterThan(Date.now());
        expect(sendEmail).toHaveBeenCalledWith(
            'forgot-success@test.com',
            expect.any(String),
            expect.any(String)
        );
    });
});

// ---------------------------------------------------------------------------
// verifyCode — success and error paths
// ---------------------------------------------------------------------------
describe('verifyCode', () => {
    it('returns {} when code is correct and not expired', async () => {
        const code = '123456';
        const token = jwt.sign({ code }, 'test-jwt-secret-key-for-testing', { expiresIn: '10m' });
        const admin = await makeAdmin({
            email: 'verify-ok@test.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });

        const result = await adminService.verifyCode('verify-ok@test.com', '123456');
        expect(result).toEqual({});
    });

    it('throws 400 when admin has no token', async () => {
        await makeAdmin({ email: 'verify-notoken@test.com' });

        await expect(adminService.verifyCode('verify-notoken@test.com', '123456'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when token is expired', async () => {
        const code = '999999';
        const token = jwt.sign({ code }, 'test-jwt-secret-key-for-testing', { expiresIn: '10m' });
        const admin = await makeAdmin({
            email: 'verify-expired@test.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() - 1000, // already expired
        });

        await expect(adminService.verifyCode('verify-expired@test.com', '999999'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when code is wrong', async () => {
        const correctCode = '111111';
        const token = jwt.sign({ code: correctCode }, 'test-jwt-secret-key-for-testing', { expiresIn: '10m' });
        await makeAdmin({
            email: 'verify-wrong@test.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });

        await expect(adminService.verifyCode('verify-wrong@test.com', '999999'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when admin not found', async () => {
        await expect(adminService.verifyCode('noone@test.com', '123456'))
            .rejects.toMatchObject({ status: 404 });
    });
});

// ---------------------------------------------------------------------------
// resetPassword — success and error paths
// ---------------------------------------------------------------------------
describe('resetPassword', () => {
    it('resets password when code is correct and not expired', async () => {
        const code = '777777';
        const token = jwt.sign({ code }, 'test-jwt-secret-key-for-testing', { expiresIn: '10m' });
        const admin = await makeAdmin({
            email: 'reset-ok@test.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });

        const result = await adminService.resetPassword('reset-ok@test.com', 'NewPass@1234', '777777');
        expect(result).toEqual({});

        const updated = await Admin.findById(admin._id).lean();
        expect(updated.resetPasswordToken).toBeUndefined();
        expect(updated.resetPasswordExpires).toBeUndefined();
        const isMatch = await bcrypt.compare('NewPass@1234', updated.password);
        expect(isMatch).toBe(true);
    });

    it('throws 404 when admin not found', async () => {
        await expect(adminService.resetPassword('nobody@test.com', 'newpass', 'code'))
            .rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when token missing or expired', async () => {
        await makeAdmin({ email: 'reset-notoken@test.com' });

        await expect(adminService.resetPassword('reset-notoken@test.com', 'newpass', 'code'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when code is wrong', async () => {
        const correctCode = '444444';
        const token = jwt.sign({ code: correctCode }, 'test-jwt-secret-key-for-testing', { expiresIn: '10m' });
        await makeAdmin({
            email: 'reset-badcode@test.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });

        await expect(adminService.resetPassword('reset-badcode@test.com', 'newpass', '000000'))
            .rejects.toMatchObject({ status: 400 });
    });
});

// ---------------------------------------------------------------------------
// updatePassword
// ---------------------------------------------------------------------------
describe('updatePassword', () => {
    it('updates password when old password is correct', async () => {
        const admin = await makeAdmin({ email: 'updpw@test.com' });

        const result = await adminService.updatePassword(admin._id.toString(), 'Admin@1234', 'NewPass@9999');
        expect(result).toEqual({});

        const updated = await Admin.findById(admin._id).lean();
        const isMatch = await bcrypt.compare('NewPass@9999', updated.password);
        expect(isMatch).toBe(true);
    });

    it('throws 404 when admin not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(adminService.updatePassword(fakeId.toString(), 'old', 'new'))
            .rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when old password is wrong', async () => {
        const admin = await makeAdmin({ email: 'updpw-wrong@test.com' });

        await expect(adminService.updatePassword(admin._id.toString(), 'WrongPass!', 'new'))
            .rejects.toMatchObject({ status: 400 });
    });
});

// ---------------------------------------------------------------------------
// getAllAdmins — 404 when no admins
// ---------------------------------------------------------------------------
describe('getAllAdmins — empty state', () => {
    it('throws 404 when no admins found', async () => {
        await expect(adminService.getAllAdmins({ page: 1, limit: 10 }))
            .rejects.toMatchObject({ status: 404 });
    });
});

// ---------------------------------------------------------------------------
// getAdminById
// ---------------------------------------------------------------------------
describe('getAdminById', () => {
    it('throws 400 on invalid ObjectId', async () => {
        await expect(adminService.getAdminById('not-an-id'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when admin not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(adminService.getAdminById(fakeId.toString()))
            .rejects.toMatchObject({ status: 404 });
    });

    it('returns admin when found', async () => {
        const role = await makeRole();
        const admin = await makeAdmin({ email: 'getbyid@test.com', role: role._id });

        const result = await adminService.getAdminById(admin._id.toString());
        expect(result.email).toBe('getbyid@test.com');
        expect(result.password).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// createSubAdmin — edge case branches
// ---------------------------------------------------------------------------
describe('createSubAdmin — validation branches', () => {
    it('throws 400 when roleId is not a valid ObjectId', async () => {
        await expect(adminService.createSubAdmin({
            firstName: 'S', lastName: 'A', email: 'sa@t.com', phone: '123',
            password: 'P', roleId: 'not-valid',
        })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/invalid role/i) });
    });

    it('throws 400 when role is not found or inactive', async () => {
        const inactiveRole = await makeRole({ isActive: false });

        await expect(adminService.createSubAdmin({
            firstName: 'S', lastName: 'A', email: 'sa2@t.com', phone: '123',
            password: 'P', roleId: inactiveRole._id.toString(),
        })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/inactive/i) });
    });

    it.each([
        [{ lastName: 'A', email: 'e@t.com', phone: '1', password: 'P', roleId: '000000000000' }, /first name/i],
        [{ firstName: 'S', email: 'e@t.com', phone: '1', password: 'P', roleId: '000000000000' }, /last name/i],
        [{ firstName: 'S', lastName: 'A', phone: '1', password: 'P', roleId: '000000000000' }, /email/i],
        [{ firstName: 'S', lastName: 'A', email: 'e@t.com', password: 'P', roleId: '000000000000' }, /phone/i],
        [{ firstName: 'S', lastName: 'A', email: 'e@t.com', phone: '1', roleId: '000000000000' }, /password/i],
        [{ firstName: 'S', lastName: 'A', email: 'e@t.com', phone: '1', password: 'P' }, /role/i],
    ])('throws 400 for missing field: %j', async (data, msgPattern) => {
        await expect(adminService.createSubAdmin(data))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(msgPattern) });
    });
});

// ---------------------------------------------------------------------------
// updateSubAdmin — additional branches
// ---------------------------------------------------------------------------
describe('updateSubAdmin — edge cases', () => {
    it('throws 400 on invalid adminId format', async () => {
        await expect(adminService.updateSubAdmin('bad-id', { firstName: 'X' }))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when new roleId is invalid', async () => {
        const admin = await makeAdmin({ email: 'updsub-role@test.com' });

        await expect(adminService.updateSubAdmin(admin._id.toString(), { roleId: 'not-valid' }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/invalid role/i) });
    });

    it('throws 400 when new roleId is inactive role', async () => {
        const admin = await makeAdmin({ email: 'updsub-inactive@test.com' });
        const inactiveRole = await makeRole({ isActive: false });

        await expect(adminService.updateSubAdmin(admin._id.toString(), { roleId: inactiveRole._id.toString() }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/inactive/i) });
    });

    it('throws 400 when updated email conflicts with another admin', async () => {
        const admin1 = await makeAdmin({ email: 'updsub-a1@test.com' });
        const admin2 = await makeAdmin({ email: 'updsub-a2@test.com' });

        await expect(adminService.updateSubAdmin(admin1._id.toString(), { email: 'updsub-a2@test.com' }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/email/i) });
    });

    it('updates email when it does not conflict', async () => {
        const admin = await makeAdmin({ email: 'updsub-ok@test.com' });

        const result = await adminService.updateSubAdmin(admin._id.toString(), {
            email: 'updsub-ok-new@test.com',
        });
        expect(result.email).toBe('updsub-ok-new@test.com');
    });

    it('updates isActive field', async () => {
        const admin = await makeAdmin({ email: 'updsub-active@test.com' });

        const result = await adminService.updateSubAdmin(admin._id.toString(), { isActive: false });
        const saved = await Admin.findById(admin._id).lean();
        expect(saved.isActive).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getAllUsers — filter branches
// ---------------------------------------------------------------------------
describe('getAllUsers — filter branches', () => {
    it('filters by status=active (isDeleted=false, isBlocked=false)', async () => {
        await makeUser({ email: 'active-user@test.com', isBlocked: false, isDeleted: false });
        await makeUser({ email: 'blocked-user@test.com', isBlocked: true, isDeleted: false });

        const result = await adminService.getAllUsers({ page: 1, limit: 10, status: 'active' });

        expect(result.users.every(u => !u.isBlocked && !u.isDeleted)).toBe(true);
    });

    it('filters by status=blocked', async () => {
        await makeUser({ email: 'blocked2@test.com', isBlocked: true, isDeleted: false });
        await makeUser({ email: 'active2@test.com', isBlocked: false, isDeleted: false });

        const result = await adminService.getAllUsers({ page: 1, limit: 10, status: 'blocked' });

        expect(result.users.every(u => u.isBlocked === true)).toBe(true);
    });

    it('filters by status=deleted', async () => {
        await makeUser({ email: 'deleted2@test.com', isDeleted: true });
        await makeUser({ email: 'notdeleted2@test.com', isDeleted: false });

        const result = await adminService.getAllUsers({ page: 1, limit: 10, status: 'deleted' });

        expect(result.users.every(u => u.isDeleted === true)).toBe(true);
    });

    it('filters by platform=web', async () => {
        await makeUser({ email: 'web-user@test.com', platform: 'web' });
        await makeUser({ email: 'mobile-user@test.com', platform: 'mobile' });

        const result = await adminService.getAllUsers({ page: 1, limit: 10, platform: 'web' });

        expect(result.users.every(u => /^(web|website)$/i.test(u.platform || ''))).toBe(true);
    });

    it('filters by platform=mobile (non-web)', async () => {
        await makeUser({ email: 'mob2-user@test.com', platform: 'mobile' });

        const result = await adminService.getAllUsers({ page: 1, limit: 10, platform: 'mobile' });

        expect(result.users.length).toBeGreaterThan(0);
    });

    it('filters by authProvider', async () => {
        await makeUser({ email: 'google-user@test.com', authProvider: 'google' });
        await makeUser({ email: 'local-user@test.com', authProvider: 'local' });

        const result = await adminService.getAllUsers({ page: 1, limit: 10, authProvider: 'google' });

        expect(result.users.every(u => u.authProvider === 'google')).toBe(true);
    });

    it('filters by date range (startDate and endDate)', async () => {
        const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0];

        await makeUser({ email: 'date-user@test.com' });

        const result = await adminService.getAllUsers({
            page: 1, limit: 10,
            startDate: yesterday,
            endDate: tomorrow,
        });

        expect(result.users.length).toBeGreaterThan(0);
    });

    it('applies text search across name/email/phone', async () => {
        await makeUser({ email: 'searchme@test.com', name: 'Unique SearchName' });

        const result = await adminService.getAllUsers({ page: 1, limit: 10, search: 'SearchName' });

        expect(result.users.some(u => u.name === 'Unique SearchName')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// exportUsers — filter branches
// ---------------------------------------------------------------------------
describe('exportUsers — filter branches', () => {
    it('returns all users when no filters', async () => {
        await makeUser({ email: 'export1@test.com' });

        const result = await adminService.exportUsers({});
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });

    it('filters by status, platform, authProvider, dates', async () => {
        const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0];
        await makeUser({ email: 'export-google@test.com', authProvider: 'google', platform: 'mobile', isBlocked: true, isDeleted: false });

        const result = await adminService.exportUsers({
            status: 'blocked',
            platform: 'mobile',
            authProvider: 'google',
            startDate: yesterday,
            endDate: tomorrow,
        });

        expect(Array.isArray(result)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getOrders — filter branches
// ---------------------------------------------------------------------------
describe('getOrders — filter branches', () => {
    it('filters by paymentStatus', async () => {
        const user = await makeUser({ email: 'ordpstatus@test.com' });
        await makeOrder(user._id, { payment_status: 'paid', order_id: 'ORDPS-001', order_no: 90001 });
        await makeOrder(user._id, { payment_status: 'pending', order_id: 'ORDPS-002', order_no: 90002 });

        const result = await adminService.getOrders({ page: 1, limit: 10, paymentStatus: 'pending' });

        expect(result.orders.every(o => /^pending$/i.test(o.payment_status))).toBe(true);
    });

    it('filters by paymentMethod=stripe (matches card or stripe)', async () => {
        const user = await makeUser({ email: 'ordpmethod@test.com' });
        await makeOrder(user._id, { payment_method: 'stripe', order_id: 'ORDPM-001', order_no: 90101 });
        await makeOrder(user._id, { payment_method: 'cash', order_id: 'ORDPM-002', order_no: 90102 });

        const result = await adminService.getOrders({ page: 1, limit: 10, paymentMethod: 'stripe' });

        expect(result.orders.every(o => /^(card|stripe)$/i.test(o.payment_method))).toBe(true);
    });

    it('filters by platform=website', async () => {
        const user = await makeUser({ email: 'ordplat@test.com' });
        await makeOrder(user._id, { orderfrom: 'website', order_id: 'ORDPL-001', order_no: 90201 });
        await makeOrder(user._id, { orderfrom: 'mobile app', order_id: 'ORDPL-002', order_no: 90202 });

        const result = await adminService.getOrders({ page: 1, limit: 10, platform: 'website' });

        expect(result.orders.every(o => /^website$/i.test(o.orderfrom))).toBe(true);
    });

    it('filters by platform=mobileapp', async () => {
        const user = await makeUser({ email: 'ordplatmob@test.com' });
        await makeOrder(user._id, { orderfrom: 'mobile app', order_id: 'ORDPLM-001', order_no: 90301 });

        const result = await adminService.getOrders({ page: 1, limit: 10, platform: 'mobileapp' });

        expect(result.orders.every(o => /^(mobile\s*app|mobileapp)$/i.test(o.orderfrom))).toBe(true);
    });

    it('filters by date range', async () => {
        const user = await makeUser({ email: 'orddates@test.com' });
        await makeOrder(user._id, { order_id: 'ORDDT-001', order_no: 90401 });

        const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0];

        const result = await adminService.getOrders({
            page: 1, limit: 10,
            startDate: yesterday,
            endDate: tomorrow,
        });

        expect(result.orders.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// updateOrderStatus
// ---------------------------------------------------------------------------
describe('updateOrderStatus', () => {
    it('throws 400 when status is missing', async () => {
        await expect(adminService.updateOrderStatus('fakeid', null, null))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when status is not in allowed sequence', async () => {
        const user = await makeUser({ email: 'updordstatus1@test.com' });
        const order = await makeOrder(user._id, { order_id: 'ORD-UOS-001', order_no: 91001 });

        await expect(adminService.updateOrderStatus(order._id.toString(), 'Shipped', null))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when order not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(adminService.updateOrderStatus(fakeId.toString(), 'Packed', null))
            .rejects.toMatchObject({ status: 404 });
    });

    it('updates order status and builds filtered orderTracks', async () => {
        const user = await makeUser({ email: 'updordstatus2@test.com' });
        const order = await makeOrder(user._id, {
            order_id: 'ORD-UOS-002',
            order_no: 91002,
            status: 'Confirmed',
            orderTracks: [
                { status: 'Confirmed', dateTime: '2024-01-01', image: null }
            ],
        });

        const result = await adminService.updateOrderStatus(order._id.toString(), 'Packed', null);

        expect(result.status).toBe('Packed');
        expect(result.orderTracks.some(t => t.status === 'Packed')).toBe(true);
    });

    it('attaches imagePath to track when filePath is provided', async () => {
        process.env.BACKEND_URL = 'https://example.com';
        const user = await makeUser({ email: 'updordstatus3@test.com' });
        const order = await makeOrder(user._id, { order_id: 'ORD-UOS-003', order_no: 91003 });

        const result = await adminService.updateOrderStatus(
            order._id.toString(), 'Packed', 'uploads\\image.jpg'
        );

        expect(result.orderTracks.find(t => t.status === 'Packed')?.image)
            .toContain('uploads/image.jpg');
    });
});

// ---------------------------------------------------------------------------
// blockUser / unblockUser — error branches
// ---------------------------------------------------------------------------
describe('blockUser — error branches', () => {
    it('throws 400 on invalid userId format', async () => {
        await expect(adminService.blockUser('bad-id'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when user not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(adminService.blockUser(fakeId.toString()))
            .rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when user is already deleted', async () => {
        const user = await makeUser({ email: 'block-deleted@test.com', isDeleted: true });

        await expect(adminService.blockUser(user._id.toString()))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/deleted/i) });
    });

    it('throws 400 when user is already blocked', async () => {
        const user = await makeUser({ email: 'block-already@test.com', isBlocked: true });

        await expect(adminService.blockUser(user._id.toString()))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/already blocked/i) });
    });
});

describe('unblockUser — error branches', () => {
    it('throws 400 on invalid userId format', async () => {
        await expect(adminService.unblockUser('bad-id'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when user not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(adminService.unblockUser(fakeId.toString()))
            .rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when user is not blocked', async () => {
        const user = await makeUser({ email: 'unblock-ok@test.com', isBlocked: false });

        await expect(adminService.unblockUser(user._id.toString()))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not blocked/i) });
    });
});

// ---------------------------------------------------------------------------
// deleteUser — error branches
// ---------------------------------------------------------------------------
describe('deleteUser — error branches', () => {
    it('throws 400 on invalid userId format', async () => {
        await expect(adminService.deleteUser('bad-id'))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when user is already deleted', async () => {
        const user = await makeUser({ email: 'del-already@test.com', isDeleted: true });

        await expect(adminService.deleteUser(user._id.toString()))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/already deleted/i) });
    });
});

// ---------------------------------------------------------------------------
// restoreUser — error branches
// ---------------------------------------------------------------------------
describe('restoreUser — error branches', () => {
    it('throws 400 when user is not deleted', async () => {
        const user = await makeUser({ email: 'restore-notdel@test.com', isDeleted: false });

        await expect(adminService.restoreUser(user._id.toString()))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not deleted/i) });
    });
});

// ---------------------------------------------------------------------------
// updateUser — error branches
// ---------------------------------------------------------------------------
describe('updateUser', () => {
    it('throws 400 on invalid userId format', async () => {
        await expect(adminService.updateUser('bad-id', { name: 'X' }))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when user not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(adminService.updateUser(fakeId.toString(), { name: 'X' }))
            .rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when user is deleted', async () => {
        const user = await makeUser({ email: 'updusr-del@test.com', isDeleted: true });

        await expect(adminService.updateUser(user._id.toString(), { name: 'X' }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/deleted/i) });
    });

    it('throws 400 when email conflicts with another user', async () => {
        const u1 = await makeUser({ email: 'updusr-u1@test.com' });
        const u2 = await makeUser({ email: 'updusr-u2@test.com' });

        await expect(adminService.updateUser(u1._id.toString(), { email: 'updusr-u2@test.com' }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/email/i) });
    });

    it('updates user fields successfully', async () => {
        const user = await makeUser({ email: 'updusr-ok@test.com', name: 'Old Name' });

        const result = await adminService.updateUser(user._id.toString(), {
            name: 'New Name',
            phone: '0501111111',
        });

        expect(result.name).toBe('New Name');
        expect(result.phone).toBe('0501111111');
    });
});

// ---------------------------------------------------------------------------
// enrichOrdersWithDetails — exercised via getUserById with orders + details
// ---------------------------------------------------------------------------
describe('enrichOrdersWithDetails — via getUserById with order details', () => {
    it('attaches order_details and sku to enriched orders', async () => {
        const product = await Product.create({
            product: { id: 'enrich-prod1', name: 'Enrich Widget', sku_number: 'SKU-EW1' },
            variantsData: [],
            totalQty: 5,
            status: true,
        });

        const user = await makeUser({ email: 'enrich-od@test.com' });
        const order = await makeOrder(user._id, { order_id: 'ENRICH-001', order_no: 98001 });
        await OrderDetail.create({
            order_id: order._id,
            product_id: product._id,
            product_name: 'Enrich Widget',
            qty: 1,
            price: 100,
        });

        const result = await adminService.getUserById(user._id.toString());

        expect(result.orders).toHaveLength(1);
        expect(result.orders[0].order_details).toHaveLength(1);
        expect(result.orders[0].order_details[0].sku).toBe('SKU-EW1');
    });
});

// ---------------------------------------------------------------------------
// getCoupons — 404 when no coupons
// ---------------------------------------------------------------------------
describe('getCoupons', () => {
    it('throws 404 when no coupons found', async () => {
        const Coupon = require('../../src/models/Coupon');
        await Coupon.deleteMany({});

        await expect(adminService.getCoupons()).rejects.toMatchObject({ status: 404 });
    });
});
