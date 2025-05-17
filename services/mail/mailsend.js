const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');
const config = require(global.BASE_DIR + '/utils/config');

let mailer = null;

function getMailer() {
  if (!mailer && config.email.mailersend?.apiKey) {
    mailer = new MailerSend({ apiKey: config.email.mailersend.apiKey });
  }
  return mailer;
}

async function sendMail({ to, subject, html }) {
  const mailer = getMailer();
  if (!mailer || !config.email.fromEmail) {
    console.warn('[MailerSend] Not properly configured.');
    return;
  }

  const emailParams = new EmailParams()
    .setFrom(new Sender(config.email.fromEmail, config.siteName || 'CityVault'))
    .setTo([new Recipient(to)])
    .setSubject(subject)
    .setHtml(html);

  await mailer.email.send(emailParams);
  console.log('[MailerSend] Sent email to', to);
}

module.exports = { sendMail };
