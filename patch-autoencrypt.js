const fs = require('fs');
const path = require('path');

console.log("[patch] Starting fresh AutoEncrypt patch (default install)...");

function patchFile(filePath, search, replace) {
  if (!fs.existsSync(filePath)) {
    console.error(`[patch] File not found: ${filePath}`);
    return;
  }

  let contents = fs.readFileSync(filePath, 'utf8');

  if (contents.includes(replace)) {
    console.log(`[patch] Already patched: ${filePath}`);
    return;
  }

  if (contents.includes(search)) {
    contents = contents.replace(search, replace);
    fs.writeFileSync(filePath, contents, 'utf8');
    console.log(`[patch] Patched: ${filePath}`);
  } else {
    console.warn(`[patch] Could not find expected line in: ${filePath}`);
  }
}

// Patch index.js: pass options into getSharedInstance
patchFile(
  path.join(__dirname, 'node_modules/@small-tech/auto-encrypt/index.js'),
  'HttpServer.getSharedInstance().then(() => {',
  'HttpServer.getSharedInstance(options).then(() => {'
);

// Patch HttpServer.js to accept and log options
const httpServerPath = path.join(__dirname, 'node_modules/@small-tech/auto-encrypt/lib/HttpServer.js');
let httpServer = fs.readFileSync(httpServerPath, 'utf8');
let modified = false;

if (httpServer.includes('static async getSharedInstance () {')) {
  httpServer = httpServer.replace(
    'static async getSharedInstance () {',
    'static async getSharedInstance (options = {}) {'
  );
  modified = true;
}

if (httpServer.includes('await HttpServer.instance.init()')) {
  httpServer = httpServer.replace(
    'await HttpServer.instance.init()',
    'await HttpServer.instance.init(options)'
  );
  modified = true;
}

if (httpServer.includes('async init () {')) {
  httpServer = httpServer.replace(
    'async init () {',
    'async init (options) {\n    this.options = options;\n'
  );
  modified = true;
}

if (httpServer.includes('this.server.listen(80, () => {')) {
  httpServer = httpServer.replace(
    'this.server.listen(80, () => {',
    'const bindHost = this.options?.httpHost || \'0.0.0.0\';\n    console.log(\'🧪 [patch] Binding to:\', bindHost);\n    this.server.listen(80, bindHost, () => {'
  );
  modified = true;
}

// New patch: override the HTTP redirect block
const redirectBlock = `        // Act as an HTTP to HTTPS forwarder.
        // (This means that servers using Auto Encrypt will get automatic HTTP to HTTPS forwarding
        // and will not fail if they are accessed over HTTP.)
        let httpsUrl = null
        try {
          httpsUrl = new URL(\`https://\${request.headers.host}\${request.url}\`)
        } catch (error) {
          log(\`   ⚠    ❨auto-encrypt❩ Failed to redirect HTTP request: \${error}\`)
          response.statusCode = 403
          response.end('403: forbidden')
          return
        }

        // Redirect HTTP to HTTPS.
        log(\`   👉    ❨auto-encrypt❩ Redirecting HTTP request to HTTPS.\`)
        response.statusCode = 307
        response.setHeader('Location', encodeUrl(httpsUrl))
        response.end()`;

const noRedirectBlock = `        // Serve HTTP requests directly using Express
        for (let i = 0; i < this.responders.length; i++) {
          const responder = this.responders[i];
          const responded = responder(request, response);
          if (responded) return;
        }

        response.statusCode = 404;
        response.end('Not Found');`;

if (httpServer.includes(redirectBlock)) {
  httpServer = httpServer.replace(redirectBlock, noRedirectBlock);
  modified = true;
  console.log('[patch] Disabled HTTP-to-HTTPS redirect');
} else {
  console.log('[patch] Redirect block already patched or not found');
}

if (modified) {
  fs.writeFileSync(httpServerPath, httpServer, 'utf8');
  console.log('[patch] Patched: HttpServer.js');
} else {
  console.log('[patch] No changes needed for HttpServer.js');
}

console.log('[patch] AutoEncrypt patch complete.');
