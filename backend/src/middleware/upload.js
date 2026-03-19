const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Garante que a pasta existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.uploadSubDir || 'misc';
    const fullPath = path.join(uploadDir, subDir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIMES.includes(file.mimetype) || !ALLOWED_EXTS.includes(ext)) {
    return cb(new Error('Tipo de arquivo não permitido'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * Middleware que define a subpasta de upload
 */
const setUploadDir = (subDir) => (req, res, next) => {
  req.uploadSubDir = subDir;
  next();
};

module.exports = { upload, setUploadDir };
