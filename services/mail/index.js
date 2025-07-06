const config = require(global.BASE_DIR + '/utils/config');

module.exports = {
  async sendMail(...args) {
    const provider = config.email?.provider;

    if (provider === 'mailersend') {
      return require('./mailsend').sendMail(...args);
    } else if (provider === 'smtp') {
      return require('./smtp').sendMail(...args);
    } else {
      console.warn('[Mail] Email not sent — email provider disabled.');
    }
  }
};
