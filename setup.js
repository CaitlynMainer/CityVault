const pm2 = require('pm2');

const APP_NAME = 'CityVault';
const SCRIPT = 'server.mjs';

pm2.connect(err => {
  if (err) {
    console.error('❌ PM2 connect error:', err);
    process.exit(2);
  }

  pm2.start({
    script: SCRIPT,
    name: APP_NAME,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M'
  }, (err) => {
    if (err) {
      console.error('❌ Failed to start app in PM2:', err);
      return pm2.disconnect();
    }

    console.log(`✅ ${APP_NAME} started via PM2`);

    // Optional: save so PM2 restarts on reboot
    pm2.dump(err => {
    if (err) {
        console.error('⚠️ Could not save PM2 process list:', err);
    } else {
        console.log('💾 PM2 process list saved.');
    }
    pm2.disconnect();
    });

  });
});
