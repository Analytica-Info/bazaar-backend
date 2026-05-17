'use strict';

/**
 * Unit tests for createSubscription use-case.
 */

// Mock firebase-admin BEFORE requiring the use-case
const mockSubscribeToTopic = jest.fn().mockResolvedValue({ successCount: 1 });
jest.mock('firebase-admin', () => ({
    messaging: () => ({ subscribeToTopic: mockSubscribeToTopic }),
}));

// Mock repositories
const mockUpsert = jest.fn();
jest.mock('../../../src/repositories', () => ({
    notifyMeSubscriptions: {
        upsert: mockUpsert,
    },
}));

// Mock email service
const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/mail/emailService', () => ({
    sendEmail: mockSendEmail,
}));

jest.mock('../../../src/utilities/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { createSubscription } = require('../../../src/services/verticals/use-cases/createSubscription');

// Helper: flush setImmediate queue so fire-and-forget callbacks run in tests.
const flushImmediate = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    jest.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    mockSubscribeToTopic.mockResolvedValue({ successCount: 1 });
});

describe('createSubscription', () => {
    it('returns alreadySubscribed: false on first subscription', async () => {
        mockUpsert.mockResolvedValue({ doc: null, created: true });

        const result = await createSubscription({ email: 'User@Example.com', vertical: 'auction' });

        expect(result).toEqual({ alreadySubscribed: false });
        expect(mockUpsert).toHaveBeenCalledWith('user@example.com', 'auction', expect.any(Object));
    });

    it('returns alreadySubscribed: true on duplicate subscription', async () => {
        mockUpsert.mockResolvedValue({ doc: { email: 'user@example.com', vertical: 'auction' }, created: false });

        const result = await createSubscription({ email: 'user@example.com', vertical: 'auction' });

        expect(result).toEqual({ alreadySubscribed: true });
    });

    it('throws 400 for invalid email', async () => {
        await expect(createSubscription({ email: 'not-an-email', vertical: 'auction' }))
            .rejects.toMatchObject({ status: 400, message: 'Invalid email' });
    });

    it('throws 400 for missing email', async () => {
        await expect(createSubscription({ email: '', vertical: 'auction' }))
            .rejects.toMatchObject({ status: 400, message: 'Invalid email' });
    });

    it('throws 400 for unknown vertical', async () => {
        await expect(createSubscription({ email: 'a@b.com', vertical: 'foo' }))
            .rejects.toMatchObject({ status: 400, message: 'Invalid vertical' });
    });

    it('throws 400 for "uae" vertical (not allowed)', async () => {
        await expect(createSubscription({ email: 'a@b.com', vertical: 'uae' }))
            .rejects.toMatchObject({ status: 400, message: 'Invalid vertical' });
    });

    it('does NOT call FCM subscribe when pushOptIn is false', async () => {
        mockUpsert.mockResolvedValue({ doc: null, created: true });

        await createSubscription({ email: 'a@b.com', vertical: 'marketplace', pushOptIn: false, deviceId: 'token123' });
        await flushImmediate();

        expect(mockSubscribeToTopic).not.toHaveBeenCalled();
    });

    it('calls FCM subscribeToTopic with correct topic when pushOptIn is true and deviceId present', async () => {
        mockUpsert.mockResolvedValue({ doc: null, created: true });

        await createSubscription({ email: 'a@b.com', vertical: 'wholesale', pushOptIn: true, deviceId: 'device-token-abc' });
        await flushImmediate();

        expect(mockSubscribeToTopic).toHaveBeenCalledWith('device-token-abc', 'vertical-launch-wholesale');
    });

    it('does NOT throw when FCM subscribe rejects', async () => {
        mockUpsert.mockResolvedValue({ doc: null, created: true });
        mockSubscribeToTopic.mockRejectedValue(new Error('FCM error'));

        await expect(
            createSubscription({ email: 'a@b.com', vertical: 'home', pushOptIn: true, deviceId: 'tok' })
        ).resolves.toEqual({ alreadySubscribed: false });

        await flushImmediate(); // let the setImmediate fire without throwing
    });

    it('does NOT throw when email send fails', async () => {
        mockUpsert.mockResolvedValue({ doc: null, created: true });
        mockSendEmail.mockRejectedValue(new Error('SMTP error'));

        await expect(
            createSubscription({ email: 'a@b.com', vertical: 'auction' })
        ).resolves.toEqual({ alreadySubscribed: false });

        await flushImmediate();
    });
});
