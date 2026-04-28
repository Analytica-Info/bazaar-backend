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

    it('should throw when name is missing', async () => {
        const user = await makeUser({ email: 'noupd-name@example.com' });

        await expect(
            authService.updateProfile(user._id, {
                email: 'noupd-name@example.com',
                phone: '1234567890',
            })
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'Name is required',
        }));
    });

    it('should update phone number successfully', async () => {
        const user = await makeUser({ email: 'upd-phone@example.com', phone: '1111111111' });

        const result = await authService.updateProfile(user._id, {
            name: 'Test User',
            email: 'upd-phone@example.com',
            phone: '9999999999',
        });

        expect(result.user.phone).toBe('9999999999');
    });
});

// ---------------------------------------------------------------------------
// getUserData
// ---------------------------------------------------------------------------
describe('authService.getUserData', () => {
    it('should return user profile data', async () => {
        const user = await makeUser({ email: 'getdata@example.com', phone: '5555555555' });

        const result = await authService.getUserData(user._id, 'web');

        expect(result.data).toBeDefined();
        expect(result.data.email).toBe('getdata@example.com');
        expect(result.coupon).toBeDefined();
    });

    it('should throw 404 when user not found', async () => {
        const fakeId = new (require('mongoose').Types.ObjectId)();

        await expect(
            authService.getUserData(fakeId, 'web')
        ).rejects.toEqual(expect.objectContaining({ status: 404 }));
    });
});

// ---------------------------------------------------------------------------
// deleteAccountPublic
// ---------------------------------------------------------------------------
describe('authService.deleteAccountPublic', () => {
    it('should soft-delete user with valid credentials', async () => {
        await makeUser({ email: 'delpub@example.com' });

        await authService.deleteAccountPublic('delpub@example.com', VALID_PASSWORD);

        const user = await User.findOne({ email: 'delpub@example.com' });
        expect(user.isDeleted).toBe(true);
        expect(user.deletedBy).toBe('user');
    });

    it('should throw when email is missing', async () => {
        await expect(
            authService.deleteAccountPublic(null, VALID_PASSWORD)
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'Email and password are required',
        }));
    });

    it('should throw on wrong password', async () => {
        await makeUser({ email: 'delpub-wrong@example.com' });

        await expect(
            authService.deleteAccountPublic('delpub-wrong@example.com', 'Wrong@9999')
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'Invalid email or password',
        }));
    });

    it('should throw when account is already deleted', async () => {
        await makeUser({
            email: 'delpub-already@example.com',
            isDeleted: true,
            deletedAt: new Date(),
        });

        await expect(
            authService.deleteAccountPublic('delpub-already@example.com', VALID_PASSWORD)
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'Account already deleted',
        }));
    });

    it('should throw when account is blocked', async () => {
        await makeUser({
            email: 'delpub-blocked@example.com',
            isBlocked: true,
            blockedAt: new Date(),
        });

        await expect(
            authService.deleteAccountPublic('delpub-blocked@example.com', VALID_PASSWORD)
        ).rejects.toEqual(expect.objectContaining({
            status: 403,
            message: expect.stringContaining('blocked'),
        }));
    });
});

// ---------------------------------------------------------------------------
// resendRecoveryCode
// ---------------------------------------------------------------------------
describe('authService.resendRecoveryCode', () => {
    it('should resend code for deleted user', async () => {
        await makeUser({
            email: 'resend@example.com',
            isDeleted: true,
            deletedAt: new Date(),
            recoveryAttempts: 0,
        });

        const result = await authService.resendRecoveryCode('resend@example.com');

        expect(result.attemptsUsed).toBe(1);
        expect(result.attemptsLeft).toBe(4);

        const user = await User.findOne({ email: 'resend@example.com' });
        expect(user.recoveryCode).toBeDefined();
        expect(user.recoveryCodeExpires).toBeDefined();
    });

    it('should throw when email is missing', async () => {
        await expect(
            authService.resendRecoveryCode(null)
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'Email is required.',
        }));
    });

    it('should throw when no deleted account found', async () => {
        await makeUser({ email: 'notdel@example.com', isDeleted: false });

        await expect(
            authService.resendRecoveryCode('notdel@example.com')
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'No deleted account found with this email.',
        }));
    });

    it('should rate limit after 5 attempts', async () => {
        await makeUser({
            email: 'ratelimit@example.com',
            isDeleted: true,
            deletedAt: new Date(),
            recoveryAttempts: 5,
            lastRecoveryRequest: new Date(),
        });

        await expect(
            authService.resendRecoveryCode('ratelimit@example.com')
        ).rejects.toEqual(expect.objectContaining({
            status: 429,
            attemptsLeft: 0,
        }));
    });

    it('should reset attempts after 24 hours', async () => {
        const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
        await makeUser({
            email: 'reset-attempts@example.com',
            isDeleted: true,
            deletedAt: new Date(),
            recoveryAttempts: 5,
            lastRecoveryRequest: pastDate,
        });

        const result = await authService.resendRecoveryCode('reset-attempts@example.com');

        expect(result.attemptsUsed).toBe(1);
        expect(result.attemptsLeft).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// register with platform differences
// ---------------------------------------------------------------------------
describe('authService.register - platform differences', () => {
    it('should register with web platform by default', async () => {
        const result = await authService.register({
            name: 'Web User',
            email: 'webuser@example.com',
            phone: '8888888888',
            password: VALID_PASSWORD,
        });

        expect(result.user).toBeDefined();
        const dbUser = await User.findOne({ email: 'webuser@example.com' });
        expect(dbUser.platform).toBe('Website');
    });

    it('should register with mobile platform', async () => {
        const result = await authService.register({
            name: 'Mobile User',
            email: 'mobileuser@example.com',
            phone: '7777777777',
            password: VALID_PASSWORD,
            platform: 'mobile',
        });

        expect(result.user).toBeDefined();
        const dbUser = await User.findOne({ email: 'mobileuser@example.com' });
        expect(dbUser.platform).toBe('Mobile app');
    });

    it('should throw on duplicate phone for mobile platform', async () => {
        await makeUser({ email: 'phone-dup1@example.com', phone: '6666666666' });

        await expect(
            authService.register({
                name: 'Dup Phone',
                email: 'phone-dup2@example.com',
                phone: '6666666666',
                password: VALID_PASSWORD,
                platform: 'mobile',
            })
        ).rejects.toEqual(expect.objectContaining({
            status: 400,
            message: 'Phone already exists with another user',
        }));
    });
});

// ---------------------------------------------------------------------------
// loginWithCredentials — return bundle
// ---------------------------------------------------------------------------
describe('authService.loginWithCredentials — return bundle', () => {
    it('success case asserts all return fields', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        await User.create({
            name: 'Bundle User',
            email: 'bundle@example.com',
            phone: '1000000001',
            password: hashedPassword,
            authProvider: 'local',
        });

        const result = await authService.loginWithCredentials({
            email: 'bundle@example.com',
            password: VALID_PASSWORD,
        });

        expect(result.tokens.accessToken).toBeDefined();
        expect(result.tokens.refreshToken).toBeDefined();
        expect(result.coupon).toBeDefined();
        expect(typeof result.totalOrderCount).toBe('number');
        expect(typeof result.usedFirst15Coupon).toBe('boolean');
        expect(result.user.name).toBe('Bundle User');
        expect(result.user.email).toBe('bundle@example.com');
    });

    it('rememberMe: true returns cookieMaxAge of 30 days', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        await User.create({
            name: 'Remember User',
            email: 'remember-true@example.com',
            phone: '1000000002',
            password: hashedPassword,
            authProvider: 'local',
        });

        const result = await authService.loginWithCredentials({
            email: 'remember-true@example.com',
            password: VALID_PASSWORD,
            rememberMe: true,
            platform: 'web',
        });

        expect(result.cookieMaxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('rememberMe: false returns cookieMaxAge of 7 days', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        await User.create({
            name: 'No Remember User',
            email: 'remember-false@example.com',
            phone: '1000000003',
            password: hashedPassword,
            authProvider: 'local',
        });

        const result = await authService.loginWithCredentials({
            email: 'remember-false@example.com',
            password: VALID_PASSWORD,
            rememberMe: false,
            platform: 'web',
        });

        expect(result.cookieMaxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('platform: mobile does not return cookieMaxAge', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        await User.create({
            name: 'Mobile Login User',
            email: 'mobile-login@example.com',
            phone: '1000000004',
            password: hashedPassword,
            authProvider: 'local',
        });

        const result = await authService.loginWithCredentials({
            email: 'mobile-login@example.com',
            password: VALID_PASSWORD,
            platform: 'mobile',
        });

        expect(result.cookieMaxAge).toBeUndefined();
    });

    it('throws 403 when user isBlocked: true', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        await User.create({
            name: 'Blocked User',
            email: 'blocked-login@example.com',
            phone: '1000000005',
            password: hashedPassword,
            authProvider: 'local',
            isBlocked: true,
            blockedAt: new Date(),
        });

        await expect(
            authService.loginWithCredentials({
                email: 'blocked-login@example.com',
                password: VALID_PASSWORD,
            })
        ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    });

    it('throws 403 with admin-deleted message when isDeleted and deletedBy: admin', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        await User.create({
            name: 'Admin Deleted User',
            email: 'admin-deleted@example.com',
            phone: '1000000006',
            password: hashedPassword,
            authProvider: 'local',
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: 'admin',
        });

        await expect(
            authService.loginWithCredentials({
                email: 'admin-deleted@example.com',
                password: VALID_PASSWORD,
            })
        ).rejects.toEqual(expect.objectContaining({
            status: 403,
            message: expect.stringContaining('administrator'),
        }));
    });

    it('throws 400 on social-only account (mobile, authProvider: google, no password)', async () => {
        await User.create({
            name: 'Google User',
            email: 'google-only@example.com',
            phone: '1000000007',
            authProvider: 'google',
        });

        await expect(
            authService.loginWithCredentials({
                email: 'google-only@example.com',
                password: VALID_PASSWORD,
                platform: 'mobile',
            })
        ).rejects.toEqual(expect.objectContaining({ status: 400 }));
    });
});

// ---------------------------------------------------------------------------
// authService.refreshToken
// ---------------------------------------------------------------------------
describe('authService.refreshToken', () => {
    it('throws 401 when no token provided', async () => {
        await expect(
            authService.refreshToken(null)
        ).rejects.toEqual(expect.objectContaining({ status: 401, message: 'No token provided' }));
    });

    it('throws 403 on invalid/tampered token string', async () => {
        await expect(
            authService.refreshToken('invalid.token.string')
        ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    });

    it('throws 403 when session not found (valid token but no matching session)', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Refresh No Session',
            email: 'refresh-nosession@example.com',
            phone: '2000000001',
            password: hashedPassword,
            authProvider: 'local',
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

        await expect(
            authService.refreshToken(token)
        ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    });

    it('success: returns new accessToken and refreshToken', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Refresh Success',
            email: 'refresh-success@example.com',
            phone: '2000000002',
            password: hashedPassword,
            authProvider: 'local',
        });

        const signedToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
        user.sessions.push({ refreshToken: signedToken, deviceId: 'test-device', revokedAt: null });
        await user.save();

        const result = await authService.refreshToken(signedToken);

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
    });

    it('success: updates session.refreshToken and session.lastUsed in DB', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Refresh DB Update',
            email: 'refresh-dbupdate@example.com',
            phone: '2000000003',
            password: hashedPassword,
            authProvider: 'local',
        });

        const signedToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
        user.sessions.push({ refreshToken: signedToken, deviceId: 'test-device', revokedAt: null });
        await user.save();

        const result = await authService.refreshToken(signedToken);

        const updatedUser = await User.findById(user._id);
        const session = updatedUser.sessions.find(s => s.refreshToken === result.refreshToken);
        expect(session).toBeDefined();
        expect(session.lastUsed).toBeDefined();
    });

    it('throws 403 when session has revokedAt set', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Refresh Revoked',
            email: 'refresh-revoked@example.com',
            phone: '2000000004',
            password: hashedPassword,
            authProvider: 'local',
        });

        const signedToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
        user.sessions.push({ refreshToken: signedToken, deviceId: 'test-device', revokedAt: new Date() });
        await user.save();

        await expect(
            authService.refreshToken(signedToken)
        ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    });
});

// ---------------------------------------------------------------------------
// authService.checkAccessToken
// ---------------------------------------------------------------------------
describe('authService.checkAccessToken', () => {
    it('throws 401 when accessToken is missing/null', async () => {
        await expect(
            authService.checkAccessToken(null, null)
        ).rejects.toEqual(expect.objectContaining({ status: 401 }));
    });

    it('returns { valid: true, userId } for a valid non-expired access token', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Check Token Valid',
            email: 'check-valid@example.com',
            phone: '3000000001',
            password: hashedPassword,
            authProvider: 'local',
        });

        const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        const result = await authService.checkAccessToken(accessToken, null);

        expect(result.valid).toBe(true);
        expect(result.userId).toBeDefined();
    });

    it('throws 401 on completely invalid (not JWT) access token', async () => {
        await expect(
            authService.checkAccessToken('not-a-jwt-token', null)
        ).rejects.toEqual(expect.objectContaining({ status: 401 }));
    });

    it('expired access token + no refreshToken throws 401', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Check Expired No Refresh',
            email: 'check-expired-norefresh@example.com',
            phone: '3000000002',
            password: hashedPassword,
            authProvider: 'local',
        });

        const expiredToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '-1s' });

        await expect(
            authService.checkAccessToken(expiredToken, null)
        ).rejects.toEqual(expect.objectContaining({ status: 401 }));
    });

    it('expired access token + invalid refreshToken throws 403', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Check Expired Bad Refresh',
            email: 'check-expired-badrefresh@example.com',
            phone: '3000000003',
            password: hashedPassword,
            authProvider: 'local',
        });

        const expiredToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '-1s' });

        await expect(
            authService.checkAccessToken(expiredToken, 'invalid.refresh.token')
        ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    });

    it('expired access token + valid refreshToken with matching session returns new tokens', async () => {
        const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await User.create({
            name: 'Check Expired Good Refresh',
            email: 'check-expired-goodrefresh@example.com',
            phone: '3000000004',
            password: hashedPassword,
            authProvider: 'local',
        });

        const expiredToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '-1s' });
        const validRefreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

        user.sessions.push({ refreshToken: validRefreshToken, deviceId: 'test-device', revokedAt: null });
        await user.save();

        const result = await authService.checkAccessToken(expiredToken, validRefreshToken);

        expect(result.valid).toBe(false);
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
    });
});
