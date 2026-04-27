const { Resend } = require('resend');

/**
 * Envia email via Resend (HTTPS — sem bloqueio de porta SMTP).
 *
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {Object} [params.attachment] - { filename, buffer, mime }
 */
async function sendEmail(params) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY não configurada');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const from = process.env.RESEND_FROM || 'IMP Locadora <onboarding@resend.dev>';

  const payload = {
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  };

  if (params.attachment) {
    payload.attachments = [{
      filename: params.attachment.filename,
      content: params.attachment.buffer,
    }];
  }

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    throw new Error(`Resend erro: ${error.message}`);
  }

  console.log(`[EMAIL] Enviado para ${params.to} | id: ${data.id}`);
  return data;
}

const ADMIN_NOTIFY_EMAIL = 'kennrick@gmail.com';

/**
 * Notifica o admin sobre uma ação que aguarda aprovação. Fire-and-forget.
 */
function notifyAdmin({ subject, html }) {
  if (!process.env.RESEND_API_KEY) return;
  sendEmail({ to: ADMIN_NOTIFY_EMAIL, subject, html })
    .catch(err => console.warn('[NOTIFY ADMIN] erro:', err.message));
}

module.exports = { sendEmail, notifyAdmin, ADMIN_NOTIFY_EMAIL };
