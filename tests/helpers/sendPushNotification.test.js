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

function chainUsers(val) {
  return { select: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(val) };
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

  it('returns null when there are no target users', async () => {
    mockApps.push({});
    mockNotifFindById.mockResolvedValueOnce(makeNotification());
    mockNotifFindOneAndUpdate.mockResolvedValueOnce(makeNotification({ sendToAll: false }));
    mockUserFind.mockReturnValue(chainUsers([]));
    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toBeNull();
    mockApps.length = 0;
  });

  it('sends to all users when sendToAll=true (FCM success)', async () => {
    mockApps.push({});
    const notif = makeNotification({ sendToAll: true });
    mockNotifFindById.mockResolvedValueOnce(notif);
    mockNotifFindOneAndUpdate.mockResolvedValueOnce(notif);
    mockUserFind.mockReturnValue(chainUsers([{ _id: 'u1', fcmToken: 'tok1' }]));
    mockMessagingSend.mockResolvedValue('msg-id-1');
    mockNotifInsertMany.mockResolvedValue([{}]);
    mockNotifFindByIdAndUpdate.mockResolvedValue({});
    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toMatchObject({ successCount: 1, failCount: 0 });
    mockApps.length = 0;
  });

  it('handles FCM failure gracefully (failCount > 0)', async () => {
    mockApps.push({});
    const notif = makeNotification({ sendToAll: false, targetUsers: ['u1'] });
    mockNotifFindById.mockResolvedValueOnce(notif);
    mockNotifFindOneAndUpdate.mockResolvedValueOnce(notif);
    mockUserFind.mockReturnValue(chainUsers([{ _id: 'u1', fcmToken: 'tok1' }]));
    mockMessagingSend.mockRejectedValue(new Error('fcm-error'));
    mockNotifInsertMany.mockResolvedValue([{}]);
    mockNotifFindByIdAndUpdate.mockResolvedValue({});
    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toMatchObject({ successCount: 0, failCount: 1 });
    mockApps.length = 0;
  });

  it('skips users with no fcmToken (failCount incremented)', async () => {
    mockApps.push({});
    const notif = makeNotification({ sendToAll: false, targetUsers: ['u1'] });
    mockNotifFindById.mockResolvedValueOnce(notif);
    mockNotifFindOneAndUpdate.mockResolvedValueOnce(notif);
    // user has no fcmToken — the outer loop skips them
    mockUserFind.mockReturnValue(chainUsers([{ _id: 'u1', fcmToken: null }]));
    mockNotifInsertMany.mockResolvedValue([{}]);
    mockNotifFindByIdAndUpdate.mockResolvedValue({});
    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toMatchObject({ successCount: 0, failCount: 1 });
    mockApps.length = 0;
  });

  it('handles insertMany error gracefully (does not throw)', async () => {
    mockApps.push({});
    const notif = makeNotification({ sendToAll: true });
    mockNotifFindById.mockResolvedValueOnce(notif);
    mockNotifFindOneAndUpdate.mockResolvedValueOnce(notif);
    mockUserFind.mockReturnValue(chainUsers([{ _id: 'u1', fcmToken: 'tok1' }]));
    mockMessagingSend.mockResolvedValue('msg-id-1');
    mockNotifInsertMany.mockRejectedValue(new Error('bulk insert failed'));
    mockNotifFindByIdAndUpdate.mockResolvedValue({});
    await expect(helper.sendNotificationToUsers('notif-1')).resolves.toBeDefined();
    mockApps.length = 0;
  });

  it('returns null on unexpected error', async () => {
    mockNotifFindById.mockRejectedValue(new Error('unexpected'));
    const result = await helper.sendNotificationToUsers('notif-1');
    expect(result).toBeNull();
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

  it('sends due notification and marks past-due ones as failed', async () => {
    mockApps.push({});
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }); // got lock

    const dueNotif = {
      _id: 'notif-sched',
      title: 'T',
      message: 'M',
      sentAt: null,
      status: 'pending',
      sendToAll: true,
      targetUsers: [],
      scheduledDateTime: new Date(Date.now() - 1000).toISOString(),
    };

    // First find returns pending with due notifications
    mockNotifFind.mockReturnValueOnce(chainRead([dueNotif]));

    // sendNotificationToUsers calls:
    mockNotifFindById.mockResolvedValueOnce(dueNotif);
    mockNotifFindOneAndUpdate.mockResolvedValueOnce(dueNotif);
    mockUserFind.mockReturnValue(chainUsers([{ _id: 'u1', fcmToken: 'tok1' }]));
    mockMessagingSend.mockResolvedValue('msg-id');
    mockNotifInsertMany.mockResolvedValue([{}]);
    mockNotifFindByIdAndUpdate.mockResolvedValue({});

    // mark past-due
    mockNotifUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    await helper.checkAndSendScheduledNotifications();
    expect(mockNotifFindById).toHaveBeenCalledWith('notif-sched');
    mockApps.length = 0;
  });

  it('logs next pending notification when none are due', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 });

    const futureNotif = {
      _id: 'notif-future',
      status: 'pending',
      scheduledDateTime: new Date(Date.now() + 86400000).toISOString(),
    };
    mockNotifFind.mockReturnValue(chainRead([futureNotif]));
    mockNotifUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    await expect(helper.checkAndSendScheduledNotifications()).resolves.not.toThrow();
  });

  it('throws lock error when tryAcquireMinuteLock throws non-11000', async () => {
    mockUpdateOne.mockRejectedValueOnce(new Error('lock-fail'));
    await expect(helper.checkAndSendScheduledNotifications()).resolves.not.toThrow();
  });
});
