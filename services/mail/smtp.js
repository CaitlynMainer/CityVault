const nodemailer = require('nodemailer');
const config = require(global.BASE_DIR + '/utils/config');

let transporter = null;

function getTransport() {
  if (!config.email?.smtp?.host || !config.email?.smtp?.auth?.user || !config.email?.smtp?.auth?.pass) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.auth
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const from = config.email.fromEmail;
  const transport = getTransport();
  if (!transport || !config.email.fromEmail) {
    console.warn('[SMTP] Transport not configured.');
    return;
  }

  const mailOptions = { from, to, subject, html };
  await transport.sendMail(mailOptions);
  console.log('[SMTP] Sent email to', to);
}

module.exports = { sendMail };
