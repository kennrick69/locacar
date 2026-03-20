const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { uploadToCloud, isConfigured: isCloudConfigured } = require('../utils/cloudinary');

const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Garante que a pasta existe (para disco local e tmp)
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

/**
 * Processa um arquivo após multer: envia para Cloudinary se configurado,
 * senão mantém o path local. Retorna a URL final.
 * @param {Object} file - req.file do multer
 * @param {string} folder - subpasta (ex: 'cars', 'documents')
 * @returns {Promise<string>} URL final (cloudinary ou local)
 */
async function processUpload(file, folder) {
  if (!file) return null;

  // Tenta enviar para Cloudinary
  if (isCloudConfigured()) {
    const cloudUrl = await uploadToCloud(file.path, folder);
    if (cloudUrl) return cloudUrl;
  }

  // Fallback: URL local
  return `/uploads/${folder}/${file.filename}`;
}

/**
 * Processa array de arquivos (upload.array)
 */
async function processUploads(files, folder) {
  if (!files || files.length === 0) return [];
  const urls = [];
  for (const file of files) {
    const url = await processUpload(file, folder);
    if (url) urls.push(url);
  }
  return urls;
}

module.exports = { upload, setUploadDir, processUpload, processUploads };
