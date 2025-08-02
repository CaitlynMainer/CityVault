// server.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const startApp = require('./cityvault');
const expressApp = await startApp(config);

// Support HTTPS with AutoEncrypt or fall back to HTTP
if (config.useAutoEncrypt) {
  const AutoEncrypt = (await import('@small-tech/auto-encrypt')).default;
  const HttpServer = (await import('@small-tech/auto-encrypt/lib/HttpServer.js')).default;

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

} else {
  // Plain HTTP fallback
  const http = require('http');
  const port = config.port || 3000;

  http.createServer(expressApp).listen(port, config.ipAddr, () => {
    console.log(`HTTP server running at http://${config.ipAddr}:${port}`);
  });
}
