'use strict';

const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockSave = jest.fn();

jest.mock('../../src/repositories', () => ({
  backendLogs: {
    rawModel: () => ({
      findOne: mockFindOne,
      create: mockCreate,
    }),
  },
}));

jest.mock('../../src/utilities/logger', () => ({ error: jest.fn() }));

const { logBackendActivity } = require('../../src/utilities/backendLogger');

const base = {
  platform: 'Website Backend',
  activity_name: 'Inventory Update',
  status: 'success',
  message: 'Updated 5 products',
};

describe('logBackendActivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a new log entry when none exists for today', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({});

    await logBackendActivity(base);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.platform).toBe('Website Backend');
    expect(arg.total_activities).toBe(1);
    expect(arg.success_count).toBe(1);
    expect(arg.failure_count).toBe(0);
  });

  it('appends to existing log entry', async () => {
    const existingEntry = {
      activities: [],
      total_activities: 2,
      success_count: 2,
      failure_count: 0,
      save: mockSave,
    };
    mockFindOne.mockResolvedValueOnce(existingEntry);
    mockSave.mockResolvedValueOnce({});

    await logBackendActivity(base);

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(existingEntry.total_activities).toBe(3);
    expect(existingEntry.success_count).toBe(3);
  });

  it('increments failure_count on failure status', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({});

    await logBackendActivity({ ...base, status: 'failure', error_details: 'timeout' });

    const arg = mockCreate.mock.calls[0][0];
    expect(arg.failure_count).toBe(1);
    expect(arg.success_count).toBe(0);
  });

  it('sets error_details on failure', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({});

    await logBackendActivity({ ...base, status: 'failure', error_details: 'OOM' });

    const arg = mockCreate.mock.calls[0][0];
    const activity = arg.activities[0];
    expect(activity.error_details).toBe('OOM');
  });

  it('does not set error_details on success', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({});

    await logBackendActivity(base);

    const arg = mockCreate.mock.calls[0][0];
    const activity = arg.activities[0];
    expect(activity.error_details).toBeNull();
  });

  it('does not throw when create rejects', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    mockCreate.mockRejectedValueOnce(new Error('DB error'));
    await expect(logBackendActivity(base)).resolves.toBeUndefined();
  });
});
