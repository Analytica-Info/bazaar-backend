const XLSX = require("xlsx");

/**
 * Parses an uploaded Excel file and returns JSON data.
 * @param {string} filePath - Path of the uploaded Excel file.
 * @returns {Array} - Parsed data from the first sheet as a JSON array.
 */
const parseExcelFile = (filePath) => {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);
  return jsonData;
};

module.exports = {
  parseExcelFile,
};
