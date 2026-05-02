'use strict';

const mockExistsSync = jest.fn();
const mockUnlinkSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
}));

const deleteOldFile = require('../../src/utils/deleteOldFile');

describe('deleteOldFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when fileUrl is null', () => {
    deleteOldFile(null);
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('does nothing when fileUrl is undefined', () => {
    deleteOldFile(undefined);
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('does nothing when fileUrl is empty string', () => {
    deleteOldFile('');
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('deletes file when it exists', () => {
    mockExistsSync.mockReturnValueOnce(true);
    deleteOldFile('https://example.com/uploads/images/photo.jpg');
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
  });

  it('does not call unlinkSync when file does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);
    deleteOldFile('https://example.com/uploads/images/gone.jpg');
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('strips query string before resolving path', () => {
    mockExistsSync.mockReturnValueOnce(true);
    deleteOldFile('https://example.com/uploads/test.png?v=2');
    const calledPath = mockExistsSync.mock.calls[0][0];
    expect(calledPath).not.toContain('?v=2');
  });

  it('does not throw when unlinkSync throws', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockUnlinkSync.mockImplementationOnce(() => { throw new Error('permission denied'); });
    expect(() => deleteOldFile('https://example.com/uploads/locked.jpg')).not.toThrow();
  });
});
