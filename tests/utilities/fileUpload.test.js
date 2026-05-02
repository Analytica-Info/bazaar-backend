'use strict';

const mockExistsSync = jest.fn().mockReturnValue(true);
const mockMkdirSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

// multer is complex to mock in full — we test the fileFilter callback directly.
// The createUpload function returns a multer instance; we verify it doesn't throw
// and that the fileFilter logic works.

jest.mock('multer', () => {
  const multerMock = jest.fn().mockImplementation(({ fileFilter: ff, storage, limits }) => {
    return { _fileFilter: ff, _storage: storage, _limits: limits };
  });
  multerMock.diskStorage = jest.fn().mockImplementation(({ destination, filename }) => {
    return { destination, filename };
  });
  return multerMock;
});

const createUpload = require('../../src/utilities/fileUpload');

describe('createUpload (fileFilter)', () => {
  const imgTypes = /jpeg|jpg|png|gif/;

  function makeFile(originalname, mimetype) {
    return { originalname, mimetype };
  }

  function invokeFilter(fileTypes, file) {
    const upload = createUpload(fileTypes);
    const cb = jest.fn();
    upload._fileFilter({}, file, cb);
    return cb;
  }

  it('accepts allowed image type (jpeg)', () => {
    const cb = invokeFilter(imgTypes, makeFile('photo.jpeg', 'image/jpeg'));
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('accepts allowed image type (png)', () => {
    const cb = invokeFilter(imgTypes, makeFile('photo.png', 'image/png'));
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('rejects disallowed extension (pdf)', () => {
    const cb = invokeFilter(imgTypes, makeFile('doc.pdf', 'application/pdf'));
    expect(cb).toHaveBeenCalledWith(expect.stringContaining('Invalid file type'));
  });

  it('rejects when extension ok but mimetype mismatches', () => {
    // extension passes but mimetype fails
    const cb = invokeFilter(imgTypes, makeFile('photo.jpeg', 'text/plain'));
    expect(cb).toHaveBeenCalledWith(expect.stringContaining('Invalid file type'));
  });

  it('sets 5MB file size limit', () => {
    const upload = createUpload(imgTypes);
    expect(upload._limits.fileSize).toBe(1024 * 1024 * 5);
  });
});

describe('createUpload (storage destination)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates folder if it does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);
    const imgTypes = /jpeg|jpg/;
    const upload = createUpload(imgTypes, 'uploads/test/');
    const cb = jest.fn();
    upload._storage.destination({}, {}, cb);
    expect(mockMkdirSync).toHaveBeenCalledWith('uploads/test/', { recursive: true });
    expect(cb).toHaveBeenCalledWith(null, 'uploads/test/');
  });

  it('does not call mkdirSync when folder exists', () => {
    mockExistsSync.mockReturnValueOnce(true);
    const upload = createUpload(/jpeg/, 'uploads/existing/');
    const cb = jest.fn();
    upload._storage.destination({}, {}, cb);
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});
