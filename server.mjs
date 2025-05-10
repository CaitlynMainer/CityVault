// server.mjs
import { createRequire } from 'module';
import AutoEncrypt from '@small-tech/auto-encrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import HttpServer from '@small-tech/auto-encrypt/lib/HttpServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create require for CommonJS modules
const require = createRequire(import.meta.url);

// Load Express app and config.json using CommonJS require
const expressApp = require('./cityvault.js');

// Load config.json directly
const configPath = path.join(__dirname, 'data', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath));

const domain = config.domain;
const ipAddress = config.ipAddr;

AutoEncrypt.createServer({
  domains: [config.domain],
  httpHost: config.ipAddr
}, expressApp).listen(443, config.ipAddr, async () => {
  console.log(`AutoEncrypt HTTPS server running at https://${config.domain} bound to ${config.ipAddr}`);

  const http = await HttpServer.getSharedInstance();
  http.addResponder((req, res) => {
    if (req.url.startsWith('/.well-known/acme-challenge/')) {
      return false; // Let Auto Encrypt handle it
    }

    // Otherwise, let Express handle the request
    expressApp(req, res);
    return true;
  });
});
