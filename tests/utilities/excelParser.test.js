'use strict';

// xlsx is not in package.json — mock it entirely
const mockSheetToJson = jest.fn();
const mockReadFile = jest.fn();

jest.mock('xlsx', () => ({
  readFile: mockReadFile,
  utils: { sheet_to_json: mockSheetToJson },
}), { virtual: true });

const { parseExcelFile } = require('../../src/utilities/excelParser');

describe('parseExcelFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    });
  });

  it('returns an array of objects from the first sheet', () => {
    const rows = [
      { name: 'Product A', price: 10, qty: 5 },
      { name: 'Product B', price: 20, qty: 3 },
    ];
    mockSheetToJson.mockReturnValueOnce(rows);

    const result = parseExcelFile('/some/path.xlsx');

    expect(result).toEqual(rows);
    expect(mockReadFile).toHaveBeenCalledWith('/some/path.xlsx');
  });

  it('returns empty array when sheet has no rows', () => {
    mockSheetToJson.mockReturnValueOnce([]);
    expect(parseExcelFile('/empty.xlsx')).toEqual([]);
  });

  it('reads from first sheet name', () => {
    mockReadFile.mockReturnValueOnce({
      SheetNames: ['Data', 'Summary'],
      Sheets: { Data: {}, Summary: {} },
    });
    mockSheetToJson.mockReturnValueOnce([{ x: 1 }]);

    parseExcelFile('/multi-sheet.xlsx');

    // sheet_to_json called with the 'Data' sheet (first sheet)
    expect(mockSheetToJson).toHaveBeenCalledWith({});
  });

  it('throws when readFile throws', () => {
    mockReadFile.mockImplementationOnce(() => { throw new Error('File not found'); });
    expect(() => parseExcelFile('/bad.xlsx')).toThrow('File not found');
  });
});
