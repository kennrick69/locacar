/**
 * Cloudinary upload helper.
 * Envia arquivo para o Cloudinary e retorna a URL pública.
 * Se CLOUDINARY_URL não estiver configurada, faz fallback para disco local.
 */
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configura automaticamente via CLOUDINARY_URL env var
// Formato: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
function isConfigured() {
  return !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);
}

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Faz upload de um arquivo para o Cloudinary.
 * @param {string} filePath - Caminho local do arquivo (multer tmp)
 * @param {string} folder - Pasta no Cloudinary (ex: 'cars', 'documents')
 * @returns {Promise<string>} URL pública do arquivo
 */
async function uploadToCloud(filePath, folder = 'uploads') {
  if (!isConfigured()) {
    return null; // fallback: usa disco local
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `implocadora/${folder}`,
      resource_type: 'auto', // suporta imagem, pdf, etc
      transformation: folder === 'cars' || folder === 'properties'
        ? [{ quality: 'auto', fetch_format: 'auto' }]
        : undefined,
    });

    // Remove arquivo temporário local
    try { fs.unlinkSync(filePath); } catch {}

    return result.secure_url;
  } catch (err) {
    console.error('[CLOUDINARY] Erro no upload:', err.message);
    return null; // fallback: usa disco local
  }
}

/**
 * Remove arquivo do Cloudinary pelo public_id extraído da URL.
 */
async function deleteFromCloud(url) {
  if (!isConfigured() || !url || !url.includes('cloudinary')) return;

  try {
    // Extrai public_id da URL: .../implocadora/cars/abc123.jpg → implocadora/cars/abc123
    const match = url.match(/\/upload\/(?:v\d+\/)?(implocadora\/.+?)(?:\.\w+)?$/);
    if (match) {
      await cloudinary.uploader.destroy(match[1], { resource_type: 'auto' });
    }
  } catch (err) {
    console.error('[CLOUDINARY] Erro ao deletar:', err.message);
  }
}

module.exports = { uploadToCloud, deleteFromCloud, isConfigured };
