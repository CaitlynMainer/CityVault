// server.mjs
import { createRequire } from 'module';
import AutoEncrypt from '@small-tech/auto-encrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import HttpServer from '@small-tech/auto-encrypt/lib/HttpServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set global.BASE_DIR
global.BASE_DIR = __dirname;

// Create CommonJS `require`
const require = createRequire(import.meta.url);

// Ensure config is ready (and run wizard if missing)
const ensureConfig = await import('./utils/ensureConfig.mjs');
await ensureConfig.default();

// Load config and initialize app
const config = require('./utils/config');
const startApp = require('./cityvault');      // this is now a function
const expressApp = startApp(config);          // call it with config

// AutoEncrypt HTTPS server
AutoEncrypt.createServer({
  domains: [config.domain],
  httpHost: config.ipAddr
}, expressApp).listen(443, config.ipAddr, async () => {
  console.log(`AutoEncrypt HTTPS server running at https://${config.domain} bound to ${config.ipAddr}`);

  const http = await HttpServer.getSharedInstance();
  http.addResponder((req, res) => {
    if (req.url.startsWith('/.well-known/acme-challenge/')) return false;

    expressApp(req, res);
    return true;
  });
});
