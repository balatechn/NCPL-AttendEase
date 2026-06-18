const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const APP_URL = process.env.APP_URL || 'http://49.206.25.183:3000';
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.EMAIL_SERVER;
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_LOGIN;
  const pass = process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
    logger.warn('Email SMTP not configured — skipping email transport');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  transporter.verify((err) => {
    if (err) logger.error('SMTP verification failed', err.message);
    else logger.info('SMTP email transport ready');
  });

  return transporter;
}

/**
 * Send an email notification.
 * Fails silently — email errors should never block the main flow.
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const t = getTransporter();
    if (!t) return;

    const from = process.env.EMAIL_FROM || 'no-reply@nationalgroupindia.com';

    await t.sendMail({ from, to, subject, html, text });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error(`Email send failed to ${to}: ${err.message}`);
  }
}

/**
 * Build and send a notification email.
 */
async function sendNotificationEmail({ employeeEmail, employeeName, title, message, type }) {
  if (!employeeEmail) return;

  const typeColors = {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#6366f1',
  };
  const color = typeColors[type] || typeColors.info;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;">
    <tr>
      <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">NCPL AttendEase</h1>
      </td>
    </tr>
    <tr>
      <td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
        <div style="display:inline-block;padding:4px 12px;border-radius:6px;background:${color}20;color:${color};font-size:12px;font-weight:600;margin-bottom:16px;">${type.toUpperCase()}</div>
        <h2 style="margin:12px 0 8px;color:#1e293b;font-size:18px;">${title}</h2>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">${message}</p>
        <a href="${APP_URL}/login" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open AttendEase</a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;margin:0;">
          Hi ${employeeName || 'Team Member'},<br/>
          This is an automated notification from NCPL AttendEase. Please do not reply to this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} National Group India. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${title}\n\n${message}\n\n- NCPL AttendEase`;

  await sendEmail({ to: employeeEmail, subject: `AttendEase: ${title}`, html, text });
}

module.exports = { sendEmail, sendNotificationEmail };
