'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Validate and resolve a file path for download.
 * @param {string} relativePath
 * @param {string} uploadsDir
 * @returns {string} The validated full file path.
 */
function downloadFile(relativePath, uploadsDir) {
  if (!relativePath) {
    throw { status: 400, message: 'Missing file path.' };
  }

  const cleanedRelativePath = relativePath.replace(/^\/?uploads\/?/, '');
  const fullPath = path.normalize(path.join(uploadsDir, cleanedRelativePath));

  if (!fullPath.startsWith(uploadsDir)) {
    throw { status: 403, message: 'Access denied.' };
  }

  if (!fs.existsSync(fullPath)) {
    throw { status: 404, message: 'File not found.' };
  }

  return fullPath;
}

module.exports = { downloadFile };
