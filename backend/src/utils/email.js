const { spawn } = require('child_process');
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

    const child = spawn('php', [phpScript], { timeout: 30000 });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('error', (err) => {
      reject(new Error('Falha ao executar PHP: ' + err.message));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        // Tenta extrair a mensagem de erro do JSON que o PHP escreve no stdout
        try {
          const result = JSON.parse(stdout.trim());
          return reject(new Error(result.error || stderr || `PHP saiu com código ${code}`));
        } catch {
          return reject(new Error(stderr || stdout || `PHP saiu com código ${code}`));
        }
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) resolve(result);
        else reject(new Error(result.error || 'Erro desconhecido no envio PHP'));
      } catch {
        reject(new Error('Resposta PHP inválida: ' + stdout));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

module.exports = { sendEmail };
