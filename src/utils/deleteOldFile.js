const fs = require("fs");
const path = require("path");


// Helper to delete old file
function deleteOldFile(fileUrl) {
  if (!fileUrl) return;

  // Remove query string (?v=...)
  const urlWithoutQuery = fileUrl.split("?")[0];

  // Get relative path from uploads/
  const relativePathFromUploads = urlWithoutQuery.replace(/^.*\/uploads\//, "uploads/");

  // Build absolute path on server
  const absolutePath = path.join(__dirname, "../", relativePathFromUploads);

  if (fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
      console.log(`🗑 Deleted old file: ${absolutePath}`);
    } catch (err) {
      console.error(`❌ Failed to delete old file: ${absolutePath}`, err);
    }
  } else {
    console.log(`⚠ Old file not found: ${absolutePath}`);
  }
}

module.exports = deleteOldFile;