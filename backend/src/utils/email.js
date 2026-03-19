const { execFile } = require('child_process');
const path = require('path');

const phpScript = path.join(__dirname, '..', '..', 'php', 'send_email.php');

/**
 * Envia email via PHPMailer (script PHP).
 * Fire-and-forget: retorna uma Promise mas erros são apenas logados.
 *
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {Object} [params.attachment] - { filename, buffer, mime }
 */
function sendEmail(params) {
  return new Promise((resolve, reject) => {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      return reject(new Error('SMTP_USER e SMTP_PASS não configurados'));
    }

    const payload = {
      smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtp_port: process.env.SMTP_PORT || '587',
      smtp_user: smtpUser,
      smtp_pass: smtpPass,
      from_name: 'LocaCar',
      to: params.to,
      subject: params.subject,
      html: params.html,
    };

    if (params.attachment) {
      payload.attachment_filename = params.attachment.filename;
      payload.attachment_base64   = params.attachment.buffer.toString('base64');
      payload.attachment_mime     = params.attachment.mime || 'application/pdf';
    }

    execFile(
      'php',
      [phpScript],
      { input: JSON.stringify(payload), timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success) resolve(result);
          else reject(new Error(result.error || 'Erro desconhecido no envio PHP'));
        } catch {
          reject(new Error('Resposta PHP inválida: ' + stdout));
        }
      }
    );
  });
}

module.exports = { sendEmail };
