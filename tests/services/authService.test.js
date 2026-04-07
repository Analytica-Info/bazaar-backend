// Set env vars BEFORE requiring the service (JWT config reads process.env at import time)
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing';
process.env.ADMIN_EMAIL = 'admin@test.com';

require('../setup');

// Mock emailService to prevent actual emails
jest.mock('../../src/mail/emailService', () => ({
    sendEmail: jest.fn(),
}));

// Mock the CouponMobile model (Coupons.js) to avoid OverwriteModelError —
// both Coupon.js and Coupons.js register the same 'Coupon' mongoose model name.
jest.mock('../../src/models/Coupons', () => ({
    findOne: jest.fn().mockResolvedValue(null),
}));

// Mock google-auth-library (not needed for credential tests)
jest.mock('google-auth-library', () => ({
    OAuth2Client: jest.fn().mockImplementation(() => ({
        verifyIdToken: jest.fn(),
    })),
}));

// Mock apple-signin-auth
jest.mock('apple-signin-auth', () => ({
    verifyIdToken: jest.fn(),
}));

// Mock verifyEmail helper
jest.mock('../../src/helpers/verifyEmail', () => ({
    verifyEmailWithVeriEmail: jest.fn().mockResolvedValue(true),
}));

// Mock backendLogger
jest.mock('../../src/utilities/backendLogger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const authService = require('../../src/services/authService');

// Valid password that meets the regex: >=8 chars, 1 uppercase, 1 digit, 1 special
const VALID_PASSWORD = 'Test@1234';
const WEAK_PASSWORD = 'short';

const makeUser = async (overrides = {}) => {
    const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
    return User.create({
        name: 'Test User',
        email: 'test@example.com',
        phone: '1234567890',
        password: hashedPassword,
        authProvider: 'local',
        ...overrides,
    });
};

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------
describe('authService.register', () => {
    it('should throw when name is missing', async () => {
        await expect(
            authService.register({ email: 'a@b.com', phone: '123', password: VALID_PASSWORD })
        ).rejects.toEqual(expect.objectContaining({ status: 400, message: 'All fields are required' }));
    });

    it('should throw when email is missing', async () => {
        await expect(
            authService.register({ name: 'Test', phone: '123', password: VALID_PASSWORD })
        ).rejects.toEqual(expect.objectContaining({ status: 400, message: 'All fields are required' }));
    });

    it('should throw when password is too short or invalid', async () => {
        await expect(
            authService.register({ name: 'Test', email: 'a@b.com', phone: '123', password: WEAK_PASSWORD })
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: expect.stringContaining('Password must be at least 8 characters'),
        }));
    });

    it('should create user with valid data', async () => {
        const result = await authService.register({
            name: 'New User',
            email: 'new@example.com',
            phone: '9999999999',
            password: VALID_PASSWORD,
        });

        expect(result.user).toBeDefined();
        expect(result.user.email).toBe('new@example.com');
        expect(result.user.name).toBe('New User');

        // Verify user was persisted
        const dbUser = await User.findOne({ email: 'new@example.com' });
        expect(dbUser).toBeTruthy();
    });

    it('should throw on duplicate email', async () => {
        await makeUser({ email: 'dup@example.com' });

        await expect(
            authService.register({
                name: 'Another',
                email: 'dup@example.com',
                phone: '1111111111',
                password: VALID_PASSWORD,
            })
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'User already exists with this email',
        }));
    });
});

// ---------------------------------------------------------------------------
// loginWithCredentials
// ---------------------------------------------------------------------------
describe('authService.loginWithCredentials', () => {
    it('should throw when email is missing', async () => {
        await expect(
            authService.loginWithCredentials({ password: VALID_PASSWORD })
        ).rejects.toEqual(expect.objectContaining({ status: 400, message: 'Email and password are required' }));
    });

    it('should throw when user not found', async () => {
        await expect(
            authService.loginWithCredentials({ email: 'nobody@example.com', password: VALID_PASSWORD })
        ).rejects.toEqual(expect.objectContaining({ status: 400 }));
    });

    it('should throw on wrong password', async () => {
        await makeUser({ email: 'login@example.com' });

        await expect(
            authService.loginWithCredentials({ email: 'login@example.com', password: 'Wrong@1234' })
        ).rejects.toEqual(expect.objectContaining({ status: 400, message: 'Invalid email or password' }));
    });

    it('should return tokens on success', async () => {
        await makeUser({ email: 'login-ok@example.com' });

        const result = await authService.loginWithCredentials({
            email: 'login-ok@example.com',
            password: VALID_PASSWORD,
        });

        expect(result.tokens).toBeDefined();
        expect(result.tokens.accessToken).toBeDefined();
        expect(result.tokens.refreshToken).toBeDefined();
        expect(result.user.email).toBe('login-ok@example.com');
    });
});

// ---------------------------------------------------------------------------
// forgotPassword
// ---------------------------------------------------------------------------
describe('authService.forgotPassword', () => {
    it('should throw when user not found', async () => {
        await expect(
            authService.forgotPassword('nobody@example.com')
        ).rejects.toEqual(expect.objectContaining({ status: 404, message: 'User not found' }));
    });

    it('should set resetPasswordToken on existing user', async () => {
        await makeUser({ email: 'forgot@example.com' });

        await authService.forgotPassword('forgot@example.com');

        const user = await User.findOne({ email: 'forgot@example.com' });
        expect(user.resetPasswordToken).toBeDefined();
        expect(user.resetPasswordExpires).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// verifyCode
// ---------------------------------------------------------------------------
describe('authService.verifyCode', () => {
    it('should throw when code does not match', async () => {
        // Create a user with a resetPasswordToken containing a known code
        const code = '123456';
        const token = jwt.sign({ code }, process.env.JWT_SECRET, { expiresIn: '10m' });
        await makeUser({
            email: 'verify@example.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });

        await expect(
            authService.verifyCode('verify@example.com', '999999')
        ).rejects.toEqual(expect.objectContaining({ status: 400, message: 'Invalid code' }));
    });

    it('should succeed when code matches', async () => {
        const code = '654321';
        const token = jwt.sign({ code }, process.env.JWT_SECRET, { expiresIn: '10m' });
        await makeUser({
            email: 'verify-ok@example.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });

        await expect(
            authService.verifyCode('verify-ok@example.com', '654321')
        ).resolves.toEqual({});
    });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------
describe('authService.resetPassword', () => {
    it('should update password hash', async () => {
        const code = '111222';
        const token = jwt.sign({ code }, process.env.JWT_SECRET, { expiresIn: '10m' });
        await makeUser({
            email: 'reset@example.com',
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });

        const newPassword = 'NewPass@123';
        await authService.resetPassword('reset@example.com', '111222', newPassword);

        const user = await User.findOne({ email: 'reset@example.com' });
        // Password should have been updated
        const matches = await bcrypt.compare(newPassword, user.password);
        expect(matches).toBe(true);
        // Token should be cleared
        expect(user.resetPasswordToken).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// updatePassword
// ---------------------------------------------------------------------------
describe('authService.updatePassword', () => {
    it('should throw when old password is wrong', async () => {
        const user = await makeUser({ email: 'upd@example.com' });

        await expect(
            authService.updatePassword(user._id, 'Wrong@9999', 'Brand@New1')
        ).rejects.toEqual(expect.objectContaining({ status: 400, message: 'Old password is incorrect' }));
    });

    it('should update when correct', async () => {
        const user = await makeUser({ email: 'upd-ok@example.com' });
        const newPassword = 'Brand@New1';

        await authService.updatePassword(user._id, VALID_PASSWORD, newPassword);

        const updated = await User.findById(user._id);
        const matches = await bcrypt.compare(newPassword, updated.password);
        expect(matches).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------
describe('authService.deleteAccount', () => {
    it('should soft-delete user (sets isDeleted true)', async () => {
        const user = await makeUser({ email: 'del@example.com' });

        await authService.deleteAccount(user._id);

        const deleted = await User.findById(user._id);
        expect(deleted.isDeleted).toBe(true);
        expect(deleted.deletedAt).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// verifyRecoveryCode
// ---------------------------------------------------------------------------
describe('authService.verifyRecoveryCode', () => {
    it('should throw when code does not match', async () => {
        await makeUser({
            email: 'recover@example.com',
            isDeleted: true,
            deletedAt: new Date(),
            recoveryCode: '555555',
            recoveryCodeExpires: Date.now() + 15 * 60 * 1000,
        });

        await expect(
            authService.verifyRecoveryCode('recover@example.com', '000000', VALID_PASSWORD)
        ).rejects.toEqual(expect.objectContaining({ status: 400, message: 'Invalid recovery code.' }));
    });

    it('should restore user when code is valid', async () => {
        await makeUser({
            email: 'recover-ok@example.com',
            isDeleted: true,
            deletedAt: new Date(),
            recoveryCode: '777777',
            recoveryCodeExpires: Date.now() + 15 * 60 * 1000,
        });

        await authService.verifyRecoveryCode('recover-ok@example.com', '777777', VALID_PASSWORD);

        const user = await User.findOne({ email: 'recover-ok@example.com' });
        expect(user.isDeleted).toBe(false);
        expect(user.recoveryCode).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------
describe('authService.updateProfile', () => {
    it('should update name and email', async () => {
        const user = await makeUser({ email: 'profile@example.com' });

        const result = await authService.updateProfile(user._id, {
            name: 'Updated Name',
            email: 'newemail@example.com',
            phone: '1234567890',
        });

        expect(result.user.name).toBe('Updated Name');
        expect(result.user.email).toBe('newemail@example.com');
    });

    it('should throw on duplicate email', async () => {
        await makeUser({ email: 'existing@example.com', phone: '1111111111' });
        const user = await makeUser({ email: 'tochange@example.com', phone: '2222222222' });

        await expect(
            authService.updateProfile(user._id, {
                name: 'Test',
                email: 'existing@example.com',
                phone: '2222222222',
            })
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'Email already exists in another user',
        }));
    });
});
