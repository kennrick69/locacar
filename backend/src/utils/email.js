const nodemailer = require('nodemailer');

/**
 * Envia email via Nodemailer (SMTP).
 *
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {Object} [params.attachment] - { filename, buffer, mime }
 */
async function sendEmail(params) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP_USER e SMTP_PASS não configurados');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions = {
    from: `"LocaCar" <${smtpUser}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
  };

  if (params.attachment) {
    mailOptions.attachments = [{
      filename: params.attachment.filename,
      content: params.attachment.buffer,
      contentType: params.attachment.mime || 'application/pdf',
    }];
  }

  await transporter.sendMail(mailOptions);
}

module.exports = { sendEmail };
