const multer = require("multer");
const path = require("path");
const fs = require("fs");

function createUploader(relativeFolderPath) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, "../../uploads", relativeFolderPath);
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    }
  });

  return multer({ storage });
}

module.exports = createUploader;
