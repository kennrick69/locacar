const { spawn } = require('child_process');
const path = require('path');

const phpScript = path.join(__dirname, '..', '..', 'php', 'send_email.php');

/**
 * Envia email via PHP mail() (sendmail local do Railway).
 *
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {Object} [params.attachment] - { filename, buffer, mime }
 */
function sendEmail(params) {
  return new Promise((resolve, reject) => {
    const payload = {
      to: params.to,
      subject: params.subject,
      html: params.html,
      from_name: 'LocaCar',
      from_email: process.env.SMTP_USER || 'no-reply@locacar.com',
    };

    if (params.attachment) {
      payload.attachment_filename = params.attachment.filename;
      payload.attachment_base64   = params.attachment.buffer.toString('base64');
      payload.attachment_mime     = params.attachment.mime || 'application/pdf';
    }

    const child = spawn('php', [phpScript]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('error', (err) => {
      reject(new Error('Falha ao executar PHP: ' + err.message));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        try {
          const result = JSON.parse(stdout.trim());
          return reject(new Error(result.error || stderr || `PHP saiu com código ${code}`));
        } catch {
          return reject(new Error(stderr || stdout || `PHP saiu com código ${code}`));
        }
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          console.log(`[EMAIL] Enviado para ${params.to}`);
          resolve(result);
        } else {
          reject(new Error(result.error || 'Erro desconhecido'));
        }
      } catch {
        reject(new Error('Resposta PHP inválida: ' + stdout));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

module.exports = { sendEmail };
