'use strict';

/**
 * Unit tests for src/helpers/sendPushNotification.js
 *
 * Firebase admin and all DB models are fully mocked.
 * We test sendNotificationToUsers and checkAndSendScheduledNotifications logic.
 */

// ── Firebase mock ─────────────────────────────────────────────────────────────
const mockMessagingSend = jest.fn();
const mockMessaging = jest.fn().mockReturnValue({ send: mockMessagingSend });
const mockApps = [];

jest.mock('firebase-admin', () => ({
  apps: mockApps,
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: mockMessaging,
}));

// ── File system mock (service account check) ─────────────────────────────────
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false), // service account file not found → Firebase won't init
  unlinkSync: jest.fn(),
}));

// ── Notification + User models mock ──────────────────────────────────────────
const mockNotifFindById = jest.fn();
const mockNotifFindOneAndUpdate = jest.fn();
const mockNotifFindByIdAndUpdate = jest.fn();
const mockNotifUpdateMany = jest.fn();
const mockNotifFind = jest.fn();
const mockNotifCreate = jest.fn();
const mockNotifInsertMany = jest.fn();
const mockUserFind = jest.fn();

// We need mockNotifDb for cronlocks collection
const mockUpdateOne = jest.fn();
const mockColl = jest.fn().mockReturnValue({ updateOne: mockUpdateOne });

jest.mock('../../src/repositories', () => ({
  notifications: {
    rawModel: () => ({
      findById: mockNotifFindById,
      findOneAndUpdate: mockNotifFindOneAndUpdate,
      findByIdAndUpdate: mockNotifFindByIdAndUpdate,
      updateMany: mockNotifUpdateMany,
      find: mockNotifFind,
      create: mockNotifCreate,
      insertMany: mockNotifInsertMany,
      db: { collection: mockColl },
    }),
  },
  users: {
    rawModel: () => ({ find: mockUserFind }),
  },
  activityLogs: { rawModel: () => ({ create: jest.fn().mockResolvedValue({}) }) },
  backendLogs: {
    rawModel: () => ({
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    }),
  },
}));

jest.mock('../../src/utilities/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const helper = require('../../src/helpers/sendPushNotification');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNotification(overrides = {}) {
  return {
    _id: 'notif-1',
    title: 'Test Title',
    message: 'Test message',
    sentAt: null,
    status: 'pending',
    sendToAll: false,
    targetUsers: ['user-1'],
    scheduledDateTime: null,
    ...overrides,
  };
}

function chainRead(val) {
  return { read: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(val) };
}

// ── sendNotificationToUsers ───────────────────────────────────────────────────

describe('sendNotificationToUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Firebase not initialized (file doesn't exist)
    mockApps.length = 0;
  });

  it('returns null when notification not found', async () => {
    mockNotifFindById.mockResolvedValueOnce(null);
    const result = await helper.sendNotificationToUsers('notif-ghost');
    expect(result).toBeNull();
  });

  it('returns null when notification already sent (sentAt set)', async () => {
    mockNotifFindById.mockResolvedValueOnce(makeNotification({ sentAt: new Date() }));
    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toBeNull();
  });

  it('returns null when Firebase is not initialized and file missing', async () => {
    mockNotifFindById.mockResolvedValueOnce(makeNotification());
    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toBeNull();
  });

  it('returns null when findOneAndUpdate claims returns null (already claimed)', async () => {
    // Simulate firebase being initialized
    mockApps.push({});

    mockNotifFindById.mockResolvedValueOnce(makeNotification());
    mockNotifFindOneAndUpdate.mockResolvedValueOnce(null);

    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toBeNull();

    mockApps.length = 0;
  });
});

// ── checkAndSendScheduledNotifications ───────────────────────────────────────

describe('checkAndSendScheduledNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApps.length = 0;
  });

  it('skips when lock is not acquired (duplicate key)', async () => {
    mockUpdateOne.mockRejectedValueOnce({ code: 11000 }); // duplicate key → lock not acquired
    await helper.checkAndSendScheduledNotifications(); // should not throw
  });

  it('skips (returns early) when got lock returns false', async () => {
    // lock: matchedCount=0 and upsertedCount=0 → not acquired
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    mockNotifFind.mockReturnValue(chainRead([]));
    mockNotifUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    await helper.checkAndSendScheduledNotifications(); // just should not throw
  });

  it('runs without errors when there are no pending notifications', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }); // got lock
    mockNotifFind.mockReturnValue(chainRead([]));
    mockNotifUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    await expect(helper.checkAndSendScheduledNotifications()).resolves.not.toThrow();
  });
});
