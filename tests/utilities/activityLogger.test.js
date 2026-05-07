'use strict';

const mockCreate = jest.fn();

jest.mock('../../src/repositories', () => ({
  activityLogs: { rawModel: () => ({ create: mockCreate }) },
}));

jest.mock('../../src/utilities/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const { logActivity } = require('../../src/utilities/activityLogger');

describe('logActivity', () => {
  beforeEach(() => jest.clearAllMocks());

  const baseData = {
    platform: 'Website Backend',
    log_type: 'backend_activity',
    action: 'Order Creation',
    status: 'success',
    message: 'Order created',
  };

  it('creates a log entry with required fields', async () => {
    mockCreate.mockResolvedValueOnce({});
    await logActivity(baseData);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.platform).toBe('Website Backend');
    expect(arg.action).toBe('Order Creation');
    expect(arg.status).toBe('success');
  });

  it('extracts user fields from user object', async () => {
    mockCreate.mockResolvedValueOnce({});
    await logActivity({
      ...baseData,
      user: { _id: 'uid-1', name: 'Alice', email: 'alice@x.com' },
    });
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.user_id).toBe('uid-1');
    expect(arg.user_name).toBe('Alice');
    expect(arg.user_email).toBe('alice@x.com');
  });

  it('handles user with userId field (mobile style)', async () => {
    mockCreate.mockResolvedValueOnce({});
    await logActivity({
      ...baseData,
      user: { userId: 'uid-2', first_name: 'Bob', email: 'bob@x.com' },
    });
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.user_id).toBe('uid-2');
    expect(arg.user_name).toBe('Bob');
  });

  it('sets null user fields when user is not provided', async () => {
    mockCreate.mockResolvedValueOnce({});
    await logActivity(baseData);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.user_id).toBeNull();
    expect(arg.user_name).toBeNull();
    expect(arg.user_email).toBeNull();
  });

  it('adds frontend_log fields for frontend_log type', async () => {
    mockCreate.mockResolvedValueOnce({});
    await logActivity({
      ...baseData,
      log_type: 'frontend_log',
      details: { mobile_device: 'iPhone 13', app_version: '2.0.1', issue_message: 'crash' },
    });
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.mobile_device).toBe('iPhone 13');
    expect(arg.app_version).toBe('2.0.1');
    expect(arg.issue_message).toBe('crash');
  });

  it('adds backend_activity failure fields for failure status', async () => {
    mockCreate.mockResolvedValueOnce({});
    await logActivity({
      ...baseData,
      status: 'failure',
      log_type: 'backend_activity',
      details: { order_id: 'ord-1', error_details: 'DB timeout' },
    });
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.order_id).toBe('ord-1');
    expect(arg.error_details).toBe('DB timeout');
  });

  it('does not throw when ActivityLog.create rejects', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB down'));
    await expect(logActivity(baseData)).resolves.toBeUndefined();
  });
});
