const multer = require("multer");
const path = require("path");
const fs = require("fs");

const fileFilter = (fileTypes) => (req, file, cb) => {
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb("Error: Invalid file type! Only the specified file types are allowed.");
  }
};

const createUpload = (fileTypes, folder = "uploads/") => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + "-" + file.originalname);
    },
  });

  return multer({
    storage: storage,
    fileFilter: fileFilter(fileTypes),
    limits: { fileSize: 1024 * 1024 * 5 },
  });
};

module.exports = createUpload;
